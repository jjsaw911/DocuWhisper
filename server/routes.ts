import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { transcribeLongAudio } from "./replit_integrations/audio/client";
import { insertNoteSchema, insertTemplateSchema, insertUserSettingsSchema, insertPatientSchema, insertAppointmentSchema, insertPatientDocumentSchema, API_KEY_SCOPES } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";
import multer from "multer";
import { Resend } from "resend";
import externalApiRoutes from "./externalApiRoutes";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB limit for long recordings

const generateSoapSchema = z.object({
  transcript: z.string().min(1, "Transcript is required"),
  patientName: z.string().optional(),
  specialty: z.string().optional(),
  templateId: z.number().optional(),
  aiInstructions: z.string().optional(),
  outputLanguage: z.string().optional(), // ISO 639-1 code (en, es, fr, etc.)
  context: z.string().optional(), // Background patient info (history, meds, allergies)
});

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  prompt: z.string().min(1, "Template prompt is required"),
  isDefault: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  prompt: z.string().optional(),
  isDefault: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

const updateNoteSchema = z.object({
  title: z.string().optional(),
  patientName: z.string().nullable().optional(),
  subjective: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  assessment: z.string().nullable().optional(),
  plan: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  patientContext: z.string().nullable().optional(),
  patientId: z.number().nullable().optional(),
});

const translateNoteSchema = z.object({
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  targetLanguage: z.enum(["en", "es", "fr", "de", "pt"]),
});

// EMR schemas
const createPatientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().optional().transform(val => val ? new Date(val) : undefined),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insurancePolicyNumber: z.string().optional(),
  medicalHistory: z.string().optional(),
  allergies: z.string().optional(),
  medications: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  organizationId: z.number().optional(),
});

const createAppointmentSchema = z.object({
  patientId: z.number(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startTime: z.string().transform(val => new Date(val)),
  endTime: z.string().transform(val => new Date(val)),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
  appointmentType: z.enum(["general", "follow_up", "initial", "urgent", "telehealth"]).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

// EMR access middleware - checks if user has EMR access
// Owner (vendor) automatically gets full EMR access to all organizations
const hasEmrAccess = async (req: any, res: Response, next: Function) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email;
    const ownerEmail = process.env.OWNER_EMAIL;
    
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    // Owner (vendor) automatically has EMR access to all organizations
    if (ownerEmail && userEmail === ownerEmail) {
      req.isVendorOwner = true; // Flag for routes to know this is vendor access
      return next();
    }
    
    // Check for individual EMR access (legacy)
    const subscription = await storage.getSubscription(userId);
    if (subscription?.status === "active" && subscription?.hasEmrAccess) {
      return next();
    }
    
    // Check for organization-based EMR access
    const emrOrgs = await storage.getUserEmrOrganizations(userId);
    if (emrOrgs.length > 0) {
      req.emrOrganizations = emrOrgs; // Store org info for routes
      return next();
    }
    
    // No EMR access found
    return res.status(403).json({ 
      error: "EMR access not enabled. Contact your organization admin or get an EMR invite code." 
    });
  } catch (error) {
    console.error("EMR access check failed:", error);
    res.status(500).json({ error: "Failed to verify EMR access" });
  }
};

// HIPAA Audit Logging Helper
const logAudit = async (
  req: any,
  action: string,
  resourceType: string,
  resourceId?: number,
  patientId?: number,
  details?: object
) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    await storage.createAuditLog({
      userId: userId || 'anonymous',
      userEmail,
      action,
      resourceType,
      resourceId,
      patientId,
      details: details ? JSON.stringify(details) : undefined,
      ipAddress: typeof ipAddress === 'string' ? ipAddress : ipAddress?.[0],
      userAgent,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
};

const generateReferralSchema = z.object({
  patientName: z.string().optional(),
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  referToSpecialty: z.string().optional(),
  referralReason: z.string().optional(),
});

const suggestCodesSchema = z.object({
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
});

const aiAssistantSchema = z.object({
  question: z.string().min(1, "Question is required"),
  noteContent: z.string().optional(), // Full note context (transcript, SOAP, patient info)
});

const generateSummarySchema = z.object({
  patientName: z.string().optional(),
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  summaryType: z.enum(["brief", "detailed", "handover", "discharge"]).optional(),
});

const createTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  patientName: z.string().optional(),
  noteId: z.number().optional(),
  category: z.enum(["document", "order", "coordinate", "communicate"]).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().optional(),
  patientName: z.string().nullable().optional(),
  category: z.enum(["document", "order", "coordinate", "communicate"]).optional(),
  status: z.enum(["todo", "completed"]).optional(),
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Register external API routes (for third-party integrations like urgent care)
  app.use("/api/external/v1", externalApiRoutes);
  
  app.get("/api/notes", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const notes = await storage.getNotesByUser(userId);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.get("/api/notes/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const noteId = parseInt(req.params.id);
      const note = await storage.getNote(noteId);
      
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      if (note.userId !== req.user.claims.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      // Audit log for PHI access
      if (note.patientId || note.patientName) {
        await logAudit(req, 'view', 'note', noteId, note.patientId || undefined, {
          patientName: note.patientName
        });
      }
      
      res.json(note);
    } catch (error) {
      console.error("Error fetching note:", error);
      res.status(500).json({ error: "Failed to fetch note" });
    }
  });

  app.post("/api/notes", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const validationResult = insertNoteSchema.safeParse({ userId, ...req.body });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const note = await storage.createNote(validationResult.data);
      
      // Audit log for PHI creation
      if (note.patientId || note.patientName) {
        await logAudit(req, 'create', 'note', note.id, note.patientId || undefined, {
          patientName: note.patientName
        });
      }
      
      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating note:", error);
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  app.patch("/api/notes/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const noteId = parseInt(req.params.id);
      const existingNote = await storage.getNote(noteId);
      
      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      if (existingNote.userId !== req.user.claims.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const validationResult = updateNoteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const updated = await storage.updateNote(noteId, validationResult.data);
      
      // Audit log for PHI update
      if (updated && (updated.patientId || updated.patientName)) {
        await logAudit(req, 'update', 'note', noteId, updated.patientId || undefined, {
          patientName: updated.patientName
        });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating note:", error);
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  app.delete("/api/notes/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const noteId = parseInt(req.params.id);
      const existingNote = await storage.getNote(noteId);
      
      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      if (existingNote.userId !== req.user.claims.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      // Audit log for PHI deletion
      if (existingNote.patientId || existingNote.patientName) {
        await logAudit(req, 'delete', 'note', noteId, existingNote.patientId || undefined, {
          patientName: existingNote.patientName
        });
      }
      
      await storage.deleteNote(noteId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  app.post("/api/transcribe", isAuthenticated, upload.single("audio"), async (req: any, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      // Get language from request body or user settings
      const language = req.body?.language;

      console.log("Transcription request received:", {
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        language: language || "auto-detect",
      });

      const audioBuffer = req.file.buffer;
      console.log("Processing audio for transcription...");
      
      const transcript = await transcribeLongAudio(audioBuffer, language);
      console.log("Transcription successful, length:", transcript.length);

      res.json({ transcript });
    } catch (error: any) {
      console.error("Error transcribing audio:", error);
      console.error("Error details:", {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        response: error?.response?.data,
      });
      res.status(500).json({ 
        error: "Failed to transcribe audio",
        details: error?.message || "Unknown error"
      });
    }
  });

  app.post("/api/generate-soap", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = generateSoapSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const { transcript, patientName, specialty, templateId, aiInstructions, outputLanguage, context } = validationResult.data;
      
      console.log("SOAP generation request - transcript length:", transcript.length);
      console.log("SOAP generation request - transcript preview:", transcript.substring(0, 500));
      console.log("SOAP generation request - output language:", outputLanguage || "en");
      console.log("SOAP generation request - context provided:", !!context);

      let customPrompt = "";
      if (templateId) {
        const template = await storage.getTemplate(templateId);
        if (template) {
          customPrompt = template.prompt;
        }
      }

      // Language-specific instructions
      const languageNames: Record<string, string> = {
        en: "English",
        es: "Spanish (Español)",
        fr: "French (Français)",
        de: "German (Deutsch)",
        pt: "Portuguese (Português)",
      };
      const targetLanguage = languageNames[outputLanguage || "en"] || "English";
      const languageInstruction = outputLanguage && outputLanguage !== "en" 
        ? `\n\nIMPORTANT: Generate ALL content in ${targetLanguage}. The entire SOAP note must be written in ${targetLanguage}, including medical terminology where appropriate.`
        : "";

      // Build context section if provided
      const contextSection = context ? `
PATIENT BACKGROUND & CONTEXT:
${context}

Use this background information to inform your assessment. Include relevant context in the appropriate SOAP sections (e.g., past medical history in Subjective, relevant medications in Plan).
` : "";

      const basePrompt = customPrompt || `You are a medical documentation assistant. Your task is to extract and organize information from the provided patient consultation transcript into a structured SOAP note.

${specialty ? `Specialty: ${specialty}` : ""}
${patientName ? `Patient: ${patientName}` : ""}
${contextSection}
CRITICAL: Use ONLY the information from the actual transcript provided below. Do NOT use placeholder text, example text, or generic descriptions. Extract real details from the conversation.

Generate a SOAP note with these sections:
- Subjective: The patient's own description of symptoms, complaints, history, and concerns as stated in the transcript
- Objective: Any physical examination findings, vital signs, measurements, or test results mentioned in the transcript
- Assessment: Clinical diagnosis or differential diagnoses based on the transcript content
- Plan: Treatment plan, medications, follow-up instructions discussed in the transcript

Be thorough but concise. Use professional medical terminology. If a section has no relevant information in the transcript, write "No information documented for this section."${languageInstruction}`;

      const aiInstructionsSection = aiInstructions ? `

IMPORTANT - User Instructions (follow these carefully):
${aiInstructions}

Apply these instructions when generating the SOAP note. If the user asks to omit certain information, do not include it. If they ask to add context, incorporate it appropriately.` : "";

      const systemPrompt = `${basePrompt}${aiInstructionsSection}

Based on the transcript, return ONLY valid JSON with the extracted information:
{
  "subjective": "<actual patient complaints from transcript>",
  "objective": "<actual exam findings from transcript>",
  "assessment": "<actual diagnosis from transcript>",
  "plan": "<actual treatment plan from transcript>"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Transcript:\n${transcript}` }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      });

      const content = response.choices[0]?.message?.content || "{}";
      console.log("SOAP API response content:", content);
      const soapNote = JSON.parse(content);
      console.log("Parsed SOAP note:", soapNote);

      res.json(soapNote);
    } catch (error) {
      console.error("Error generating SOAP note:", error);
      res.status(500).json({ error: "Failed to generate SOAP note" });
    }
  });

  // Generate title from transcript (extract symptoms/complaints)
  app.post("/api/generate-title", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { transcript } = req.body;
      
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "Transcript is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { 
            role: "system", 
            content: `You are a medical documentation assistant. Given a transcript of a patient consultation, extract the main symptom, complaint, or reason for visit to create a brief title.

Return ONLY valid JSON in this exact format:
{
  "title": "Brief 2-4 word description of main symptom or complaint"
}

Examples of good titles:
- "Chest Pain"
- "Annual Checkup"
- "Lower Back Pain"
- "Persistent Cough"
- "Headache and Fatigue"
- "Follow-up Diabetes"

If the transcript is unclear or empty, use "General Consultation".`
          },
          { role: "user", content: `Transcript:\n${transcript}` }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 100,
      });

      const content = response.choices[0]?.message?.content || '{"title": "General Consultation"}';
      const result = JSON.parse(content);

      res.json(result);
    } catch (error) {
      console.error("Error generating title:", error);
      res.status(500).json({ error: "Failed to generate title" });
    }
  });

  // Translate SOAP note to different language
  app.post("/api/translate-note", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = translateNoteSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten().fieldErrors 
        });
      }

      const { subjective, objective, assessment, plan, targetLanguage } = validationResult.data;

      const languageNames: Record<string, string> = {
        en: "English",
        es: "Spanish (Español)",
        fr: "French (Français)",
        de: "German (Deutsch)",
        pt: "Portuguese (Português)",
      };
      const targetLangName = languageNames[targetLanguage] || targetLanguage;

      const soapContent = JSON.stringify({ subjective, objective, assessment, plan }, null, 2);

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { 
            role: "system", 
            content: `You are a medical translation assistant. Translate the following SOAP note into ${targetLangName}. 
            
Maintain all medical terminology accuracy while making the text natural in the target language. 
Preserve the structure and formatting of the original.

Return ONLY valid JSON with the same structure:
{
  "subjective": "<translated subjective section>",
  "objective": "<translated objective section>",
  "assessment": "<translated assessment section>",
  "plan": "<translated plan section>"
}`
          },
          { role: "user", content: soapContent }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const translatedNote = JSON.parse(content);

      res.json(translatedNote);
    } catch (error) {
      console.error("Error translating note:", error);
      res.status(500).json({ error: "Failed to translate note" });
    }
  });

  // Generate referral letter from SOAP note
  app.post("/api/generate-referral", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = generateReferralSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.flatten().fieldErrors });
      }
      const { patientName, subjective, objective, assessment, plan, referToSpecialty, referralReason } = validationResult.data;
      
      const soapContent = `
Patient: ${patientName || "Patient"}

SUBJECTIVE: ${subjective || "Not provided"}

OBJECTIVE: ${objective || "Not provided"}

ASSESSMENT: ${assessment || "Not provided"}

PLAN: ${plan || "Not provided"}
      `.trim();

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { 
            role: "system", 
            content: `You are a medical documentation assistant. Generate a professional referral letter based on the clinical notes provided.

The referral should be to: ${referToSpecialty || "a specialist"}
Reason for referral: ${referralReason || "Evaluation and management"}

Format the letter professionally with:
- Date
- RE: Patient name
- Dear Colleague/Dear Doctor
- Brief clinical summary
- Reason for referral
- Relevant history and findings
- Current medications (if mentioned)
- Specific questions or concerns for the specialist
- Closing with "Thank you for seeing this patient"
- Signature line for the referring physician

Keep the letter concise but comprehensive.`
          },
          { role: "user", content: soapContent }
        ],
        max_completion_tokens: 1500,
      });

      const letter = response.choices[0]?.message?.content || "";
      res.json({ referralLetter: letter });
    } catch (error) {
      console.error("Error generating referral letter:", error);
      res.status(500).json({ error: "Failed to generate referral letter" });
    }
  });

  // Generate ICD-10 code suggestions from encounter
  app.post("/api/suggest-codes", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = suggestCodesSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.flatten().fieldErrors });
      }
      const { subjective, objective, assessment, plan } = validationResult.data;
      
      const clinicalContent = `
SUBJECTIVE: ${subjective || ""}
OBJECTIVE: ${objective || ""}
ASSESSMENT: ${assessment || ""}
PLAN: ${plan || ""}
      `.trim();

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { 
            role: "system", 
            content: `You are a medical coding assistant. Based on the clinical documentation provided, suggest appropriate ICD-10 diagnosis codes.

Return a JSON object with an array of suggested codes:
{
  "codes": [
    {
      "code": "ICD-10 code (e.g., J06.9)",
      "description": "Code description",
      "category": "primary" or "secondary",
      "confidence": "high", "medium", or "low"
    }
  ],
  "cptCodes": [
    {
      "code": "CPT code (e.g., 99213)",
      "description": "E/M level description",
      "rationale": "Brief rationale for this level"
    }
  ]
}

Suggest the most relevant codes based on the documented findings. Include both primary diagnosis and any relevant secondary diagnoses. Also suggest an appropriate E/M CPT code based on the complexity of the visit.`
          },
          { role: "user", content: clinicalContent }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const codes = JSON.parse(content);
      res.json(codes);
    } catch (error) {
      console.error("Error suggesting codes:", error);
      res.status(500).json({ error: "Failed to suggest codes" });
    }
  });

  // AI-powered task suggestions from SOAP note
  app.post("/api/suggest-tasks", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = suggestCodesSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.flatten().fieldErrors });
      }
      const { subjective, objective, assessment, plan } = validationResult.data;
      
      const clinicalContent = `
SUBJECTIVE: ${subjective || ""}
OBJECTIVE: ${objective || ""}
ASSESSMENT: ${assessment || ""}
PLAN: ${plan || ""}
      `.trim();

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { 
            role: "system", 
            content: `You are a medical practice assistant. Based on the clinical documentation provided, identify any follow-up tasks that need to be completed by the clinical team.

Look for things like:
- Referrals mentioned in the plan
- Orders for labs, imaging, or tests
- Prescription refills or changes
- Follow-up appointments to schedule
- Patient education needs
- Care coordination tasks
- Communication tasks (calls, letters)

Return a JSON object with an array of suggested tasks:
{
  "tasks": [
    {
      "title": "Brief task description",
      "category": "document" | "order" | "coordinate" | "communicate",
      "priority": "high" | "medium" | "low",
      "reason": "Brief explanation of why this task is needed"
    }
  ]
}

Only suggest tasks that are clearly indicated in the documentation. If no tasks are needed, return an empty array.`
          },
          { role: "user", content: clinicalContent }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const tasks = JSON.parse(content);
      res.json(tasks);
    } catch (error) {
      console.error("Error suggesting tasks:", error);
      res.status(500).json({ error: "Failed to suggest tasks" });
    }
  });

  // AI-powered referral letter suggestions
  app.post("/api/suggest-referrals", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = suggestCodesSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.flatten().fieldErrors });
      }
      const { subjective, objective, assessment, plan } = validationResult.data;
      
      const clinicalContent = `
SUBJECTIVE: ${subjective || ""}
OBJECTIVE: ${objective || ""}
ASSESSMENT: ${assessment || ""}
PLAN: ${plan || ""}
      `.trim();

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { 
            role: "system", 
            content: `You are a medical referral coordinator. Based on the clinical documentation provided, identify any referrals that should be made to specialists.

Look for:
- Explicit referral recommendations in the plan
- Conditions that warrant specialist evaluation
- Complex cases beyond primary care scope

Return a JSON object with an array of suggested referrals:
{
  "referrals": [
    {
      "specialty": "Specialist type (e.g., Cardiology, Orthopedics)",
      "reason": "Brief reason for referral",
      "urgency": "routine" | "urgent" | "emergent"
    }
  ]
}

Only suggest referrals that are clearly indicated in the documentation or clinically appropriate. If no referrals are needed, return an empty array.`
          },
          { role: "user", content: clinicalContent }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content || "{}";
      const referrals = JSON.parse(content);
      res.json(referrals);
    } catch (error) {
      console.error("Error suggesting referrals:", error);
      res.status(500).json({ error: "Failed to suggest referrals" });
    }
  });

  // AI Chat assistant for documentation help
  app.post("/api/ai-assistant", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = aiAssistantSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.flatten().fieldErrors });
      }
      const { question, noteContent } = validationResult.data;

      const systemPrompt = noteContent ? 
        `You are a helpful AI medical documentation assistant. The user has the following clinical context:

${noteContent}

Answer their questions helpfully and concisely. If they ask about clinical matters, provide evidence-based guidance but always recommend consulting appropriate clinical resources or specialists for complex cases.` :
        `You are a helpful AI medical documentation assistant. Help healthcare providers with documentation questions, clinical coding, letter writing, and workflow optimization. Be concise and practical.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question }
        ],
        max_completion_tokens: 1000,
      });

      const answer = response.choices[0]?.message?.content || "";
      res.json({ answer });
    } catch (error) {
      console.error("Error with AI assistant:", error);
      res.status(500).json({ error: "Failed to get AI response" });
    }
  });

  // Generate patient summary from notes
  app.post("/api/generate-summary", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = generateSummarySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.flatten().fieldErrors });
      }
      const { patientName, subjective, objective, assessment, plan, summaryType } = validationResult.data;
      
      const soapContent = `
Patient: ${patientName || "Patient"}

SUBJECTIVE: ${subjective || "Not provided"}

OBJECTIVE: ${objective || "Not provided"}

ASSESSMENT: ${assessment || "Not provided"}

PLAN: ${plan || "Not provided"}
      `.trim();

      const typeInstructions: Record<string, string> = {
        brief: "Generate a brief 2-3 sentence summary suitable for a quick handover.",
        detailed: "Generate a detailed summary paragraph covering all key clinical points.",
        handover: "Generate a structured handover summary with key concerns, active issues, and pending actions.",
        discharge: "Generate discharge summary instructions for the patient including diagnosis, treatment, and follow-up."
      };

      const instruction = typeInstructions[summaryType || "brief"] || typeInstructions.brief;

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          { 
            role: "system", 
            content: `You are a medical documentation assistant. ${instruction}`
          },
          { role: "user", content: soapContent }
        ],
        max_completion_tokens: 800,
      });

      const summary = response.choices[0]?.message?.content || "";
      res.json({ summary });
    } catch (error) {
      console.error("Error generating summary:", error);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  // Template CRUD endpoints
  app.get("/api/templates", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const templates = await storage.getTemplatesByUser(userId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  app.get("/api/templates/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = await storage.getTemplate(templateId);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== req.user.claims.sub) {
        return res.status(403).json({ error: "Not authorized to view this template" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.post("/api/templates", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = createTemplateSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const userId = req.user.claims.sub;
      const template = await storage.createTemplate({
        ...validationResult.data,
        userId,
      });
      
      if (validationResult.data.isDefault) {
        await storage.setDefaultTemplate(userId, template.id);
      }
      
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating template:", error);
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.patch("/api/templates/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = await storage.getTemplate(templateId);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== req.user.claims.sub) {
        return res.status(403).json({ error: "Not authorized to update this template" });
      }
      
      const validationResult = updateTemplateSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const updated = await storage.updateTemplate(templateId, validationResult.data);
      
      if (validationResult.data.isDefault) {
        await storage.setDefaultTemplate(req.user.claims.sub, templateId);
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating template:", error);
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.delete("/api/templates/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = await storage.getTemplate(templateId);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== req.user.claims.sub) {
        return res.status(403).json({ error: "Not authorized to delete this template" });
      }
      
      await storage.deleteTemplate(templateId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // User Settings routes
  app.get("/api/settings", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const settings = await storage.getUserSettings(userId);
      
      // Return default settings if none exist
      if (!settings) {
        return res.json({
          userId,
          firstName: req.user.claims.first_name || null,
          lastName: req.user.claims.last_name || null,
          specialty: null,
          practiceName: null,
          language: "en",
          defaultTemplateId: null,
          noteStyle: "detailed",
          autoSaveEnabled: true,
          showTimestamps: true,
        });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.put("/api/settings", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      
      // Validate request body
      const validatedData = insertUserSettingsSchema.omit({ userId: true }).parse(req.body);
      
      const settings = await storage.upsertUserSettings({
        userId,
        ...validatedData,
      });
      
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid settings data", details: error.errors });
      }
      console.error("Error saving settings:", error);
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.get("/api/subscription", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const subscription = await storage.getSubscription(userId);
      
      res.json({
        status: subscription?.status || "inactive",
        currentPeriodEnd: subscription?.currentPeriodEnd,
        stripeSubscriptionId: subscription?.stripeSubscriptionId,
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  app.get("/api/stripe/price", isAuthenticated, async (req: any, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      
      const prices = await stripe.prices.list({
        active: true,
        limit: 10,
        recurring: { interval: 'month' },
        expand: ['data.product'],
      });

      const docuWhisperPrice = prices.data.find(p => 
        p.unit_amount === 2500 && p.currency === 'usd'
      );
      
      res.json({ price: docuWhisperPrice || prices.data[0] || null });
    } catch (error) {
      console.error("Error fetching price:", error);
      res.status(500).json({ error: "Failed to fetch price" });
    }
  });

  app.post("/api/stripe/checkout", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const stripe = await getUncachableStripeClient();

      let subscription = await storage.getSubscription(userId);
      let customerId = subscription?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: { userId },
        });
        customerId = customer.id;

        await storage.upsertSubscription({
          userId,
          stripeCustomerId: customerId,
          status: "inactive",
        });
      }

      const prices = await stripe.prices.list({
        active: true,
        limit: 1,
        recurring: { interval: 'month' },
      });

      const priceId = prices.data[0]?.id;

      if (!priceId) {
        return res.status(400).json({ error: "No price configured. Please set up products in Stripe." });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: `${baseUrl}/subscription?success=true`,
        cancel_url: `${baseUrl}/subscription?canceled=true`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/portal", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const stripe = await getUncachableStripeClient();

      const subscription = await storage.getSubscription(userId);

      if (!subscription?.stripeCustomerId) {
        return res.status(400).json({ error: "No subscription found" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const session = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: `${baseUrl}/subscription`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  // Helper function to check if user is admin/owner
  const isAdmin = (req: any): boolean => {
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) return false;
    return req.user?.claims?.email === ownerEmail;
  };

  // Admin middleware
  const requireAdmin = (req: any, res: Response, next: Function) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  // Check if current user is admin
  app.get("/api/admin/check", isAuthenticated, async (req: any, res: Response) => {
    res.json({ 
      isAdmin: isAdmin(req),
      userEmail: req.user?.claims?.email,
    });
  });

  // Get all subscribers (admin only)
  app.get("/api/admin/subscribers", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const allSubscriptions = await storage.getAllSubscriptions();
      res.json(allSubscriptions);
    } catch (error) {
      console.error("Error fetching subscribers:", error);
      res.status(500).json({ error: "Failed to fetch subscribers" });
    }
  });

  // Get all users (admin only)
  app.get("/api/admin/users", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const users = await storage.getAllUserSettings();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Create organization (admin only)
  app.post("/api/admin/organizations", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { name, ownerId, description } = req.body;
      
      if (!name || !ownerId) {
        return res.status(400).json({ error: "name and ownerId are required" });
      }

      const organization = await storage.createPractice({
        name,
        ownerId,
        description: description || null,
      });
      
      res.status(201).json(organization);
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ error: "Failed to create organization" });
    }
  });

  // Add member to organization (admin only)
  app.post("/api/admin/organizations/:id/members", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const { userId, role } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const member = await storage.addPracticeMember({
        practiceId,
        userId,
        role: role || "member",
        invitedBy: req.user.claims.sub,
      });
      
      res.status(201).json(member);
    } catch (error) {
      console.error("Error adding member:", error);
      res.status(500).json({ error: "Failed to add member" });
    }
  });

  // Extend a user's subscription (admin only)
  app.post("/api/admin/extend-subscription", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { userId, extensionType } = req.body;
      
      if (!userId || !extensionType) {
        return res.status(400).json({ error: "userId and extensionType are required" });
      }

      let newPeriodEnd: Date;
      const now = new Date();
      
      // Get existing subscription to extend from current period end
      const existing = await storage.getSubscription(userId);
      const baseDate = existing?.currentPeriodEnd && new Date(existing.currentPeriodEnd) > now 
        ? new Date(existing.currentPeriodEnd) 
        : now;

      switch (extensionType) {
        case "days_7":
          newPeriodEnd = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case "days_14":
          newPeriodEnd = new Date(baseDate.getTime() + 14 * 24 * 60 * 60 * 1000);
          break;
        case "days_30":
          newPeriodEnd = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
          break;
        case "months_3":
          newPeriodEnd = new Date(baseDate);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 3);
          break;
        case "months_6":
          newPeriodEnd = new Date(baseDate);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 6);
          break;
        case "months_12":
          newPeriodEnd = new Date(baseDate);
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
          break;
        case "lifetime":
          // Set to 100 years from now
          newPeriodEnd = new Date(baseDate);
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 100);
          break;
        default:
          return res.status(400).json({ error: "Invalid extensionType" });
      }

      // First ensure subscription exists
      if (!existing) {
        await storage.upsertSubscription({
          userId,
          status: "active",
          currentPeriodEnd: newPeriodEnd,
        });
      } else {
        await storage.extendSubscription(userId, newPeriodEnd);
      }

      const updated = await storage.getSubscription(userId);
      res.json(updated);
    } catch (error) {
      console.error("Error extending subscription:", error);
      res.status(500).json({ error: "Failed to extend subscription" });
    }
  });

  // Grant EMR access to user (admin only)
  app.post("/api/admin/grant-emr-access", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      // Check if user has an active subscription
      const subscription = await storage.getSubscription(userId);
      if (!subscription || subscription.status !== "active") {
        return res.status(400).json({ error: "User must have an active subscription to grant EMR access" });
      }

      await storage.grantEmrAccess(userId);
      const updated = await storage.getSubscription(userId);
      res.json(updated);
    } catch (error) {
      console.error("Error granting EMR access:", error);
      res.status(500).json({ error: "Failed to grant EMR access" });
    }
  });

  // ============ Organization EMR Management (Admin/Owner Only) ============

  // Get all organizations (admin only)
  app.get("/api/admin/organizations", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const organizations = await storage.getAllOrganizations();
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ error: "Failed to fetch organizations" });
    }
  });

  // Get all organizations with EMR licenses (admin only)
  app.get("/api/admin/emr-organizations", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const organizations = await storage.getAllOrganizationsWithEmr();
      res.json(organizations);
    } catch (error) {
      console.error("Error fetching EMR organizations:", error);
      res.status(500).json({ error: "Failed to fetch EMR organizations" });
    }
  });

  // Grant EMR license to organization (admin only)
  app.post("/api/admin/organizations/:id/emr-license", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const { licenseType, expiryDate, maxUsers } = req.body;

      if (!licenseType) {
        return res.status(400).json({ error: "licenseType is required" });
      }

      const validTypes = ["trial", "monthly", "annual", "lifetime"];
      if (!validTypes.includes(licenseType)) {
        return res.status(400).json({ error: "Invalid licenseType. Must be: trial, monthly, annual, or lifetime" });
      }

      const organization = await storage.getPractice(practiceId);
      if (!organization) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const updated = await storage.grantEmrLicenseToOrganization(
        practiceId,
        licenseType,
        expiryDate ? new Date(expiryDate) : null,
        maxUsers || 5
      );

      res.json(updated);
    } catch (error) {
      console.error("Error granting EMR license:", error);
      res.status(500).json({ error: "Failed to grant EMR license" });
    }
  });

  // Revoke EMR license from organization (admin only)
  app.delete("/api/admin/organizations/:id/emr-license", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const updated = await storage.revokeEmrLicenseFromOrganization(practiceId);
      res.json(updated);
    } catch (error) {
      console.error("Error revoking EMR license:", error);
      res.status(500).json({ error: "Failed to revoke EMR license" });
    }
  });

  // Get organization EMR members (admin only)
  app.get("/api/admin/organizations/:id/emr-members", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const members = await storage.getOrganizationEmrMembers(practiceId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching EMR members:", error);
      res.status(500).json({ error: "Failed to fetch EMR members" });
    }
  });

  // Create invite code (admin only)
  app.post("/api/admin/invites", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { membershipType, expiresAt } = req.body;
      
      if (!membershipType) {
        return res.status(400).json({ error: "membershipType is required" });
      }

      const validTypes = ["trial_7", "trial_14", "trial_30", "months_1", "months_3", "months_6", "months_12", "lifetime", "emr_access", "emr_trial_30", "emr_months_1", "emr_months_12", "emr_lifetime"];
      if (!validTypes.includes(membershipType)) {
        return res.status(400).json({ error: "Invalid membershipType" });
      }

      // Generate random invite code
      const code = generateInviteCode();

      const invite = await storage.createInvite({
        code,
        membershipType,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      res.status(201).json(invite);
    } catch (error) {
      console.error("Error creating invite:", error);
      res.status(500).json({ error: "Failed to create invite" });
    }
  });

  // Get all invites (admin only)
  app.get("/api/admin/invites", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const allInvites = await storage.getAllInvites();
      res.json(allInvites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ error: "Failed to fetch invites" });
    }
  });

  // Delete invite (admin only)
  app.delete("/api/admin/invites/:id", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const inviteId = parseInt(req.params.id);
      await storage.deleteInvite(inviteId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting invite:", error);
      res.status(500).json({ error: "Failed to delete invite" });
    }
  });

  // ============= API Key Management (for external integrations) =============
  
  // Get available API key scopes
  app.get("/api/admin/api-keys/scopes", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    res.json(API_KEY_SCOPES);
  });
  
  // Get API keys for an organization
  app.get("/api/admin/organizations/:id/api-keys", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const apiKeys = await storage.getApiKeysByPractice(practiceId);
      // Don't return the key hash for security
      res.json(apiKeys.map(key => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        status: key.status,
        rateLimitPerMinute: key.rateLimitPerMinute,
        lastUsedAt: key.lastUsedAt,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
        createdBy: key.createdBy,
      })));
    } catch (error) {
      console.error("Error fetching API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });
  
  // Create API key for an organization
  app.post("/api/admin/organizations/:id/api-keys", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const { name, scopes, rateLimitPerMinute, expiresAt } = req.body;
      
      if (!name || !scopes || !Array.isArray(scopes) || scopes.length === 0) {
        return res.status(400).json({ error: "name and scopes are required" });
      }
      
      const validScopes = Object.keys(API_KEY_SCOPES);
      for (const scope of scopes) {
        if (!validScopes.includes(scope)) {
          return res.status(400).json({ error: `Invalid scope: ${scope}` });
        }
      }
      
      const { apiKey, rawKey } = await storage.createApiKey({
        practiceId,
        name,
        scopes,
        rateLimitPerMinute: rateLimitPerMinute || 60,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        createdBy: req.user.claims.sub,
      });
      
      // Return the raw key ONLY once - it can never be retrieved again
      res.status(201).json({
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        status: apiKey.status,
        rateLimitPerMinute: apiKey.rateLimitPerMinute,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
        // Only returned on creation - save it securely!
        apiKey: rawKey,
      });
    } catch (error) {
      console.error("Error creating API key:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });
  
  // Revoke API key
  app.post("/api/admin/api-keys/:id/revoke", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const keyId = parseInt(req.params.id);
      const revoked = await storage.revokeApiKey(keyId, req.user.claims.sub);
      
      if (!revoked) {
        return res.status(404).json({ error: "API key not found" });
      }
      
      res.json({ message: "API key revoked successfully" });
    } catch (error) {
      console.error("Error revoking API key:", error);
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });
  
  // Delete API key
  app.delete("/api/admin/api-keys/:id", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const keyId = parseInt(req.params.id);
      await storage.deleteApiKey(keyId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting API key:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  // Get audit logs (admin only) - HIPAA compliance
  app.get("/api/admin/audit-logs", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { userId, patientId, resourceType, startDate, endDate } = req.query;
      
      const filters: any = {};
      if (userId) filters.userId = userId;
      if (patientId) filters.patientId = parseInt(patientId as string);
      if (resourceType) filters.resourceType = resourceType;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      
      const logs = await storage.getAuditLogs(Object.keys(filters).length > 0 ? filters : undefined);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });

  // Export audit logs as CSV for compliance reporting (admin only)
  app.get("/api/admin/audit-logs/export", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { userId, patientId, resourceType, startDate, endDate } = req.query;
      
      const filters: any = {};
      if (userId) filters.userId = userId;
      if (patientId) filters.patientId = parseInt(patientId as string);
      if (resourceType) filters.resourceType = resourceType;
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      
      const logs = await storage.getAuditLogs(Object.keys(filters).length > 0 ? filters : undefined);
      
      // Generate CSV
      const csvHeaders = 'Timestamp,User ID,User Email,Action,Resource Type,Resource ID,Patient ID,IP Address,Details\n';
      const csvRows = logs.map(log => {
        const details = log.details ? log.details.replace(/"/g, '""') : '';
        return `"${log.timestamp}","${log.userId}","${log.userEmail || ''}","${log.action}","${log.resourceType}","${log.resourceId || ''}","${log.patientId || ''}","${log.ipAddress || ''}","${details}"`;
      }).join('\n');
      
      const csv = csvHeaders + csvRows;
      
      // Log the export action
      await logAudit(req, 'export', 'audit_logs', undefined, undefined, {
        recordCount: logs.length,
        filters: Object.keys(filters).length > 0 ? filters : 'none'
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting audit logs:", error);
      res.status(500).json({ error: "Failed to export audit logs" });
    }
  });

  // Send invite email (admin only)
  app.post("/api/admin/send-invite", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { email, membershipType, patientName } = req.body;
      
      if (!email || !membershipType) {
        return res.status(400).json({ error: "Email and membershipType are required" });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email address" });
      }

      const validTypes = ["trial_7", "trial_14", "trial_30", "months_1", "months_3", "months_6", "months_12", "lifetime"];
      if (!validTypes.includes(membershipType)) {
        return res.status(400).json({ error: "Invalid membershipType" });
      }

      // Check if Resend API key is configured
      if (!process.env.RESEND_API_KEY) {
        return res.status(500).json({ error: "Email service not configured. Please add RESEND_API_KEY." });
      }

      // Generate invite code
      const code = generateInviteCode();

      // Create invite in database
      const invite = await storage.createInvite({
        code,
        membershipType,
        emailSentTo: email,
        expiresAt: null,
      });

      // Get membership type label for email
      const membershipLabels: { [key: string]: string } = {
        trial_7: "7-day free trial",
        trial_14: "14-day free trial",
        trial_30: "30-day free trial",
        months_1: "1 month free access",
        months_3: "3 months free access",
        months_6: "6 months free access",
        months_12: "1 year free access",
        lifetime: "lifetime access",
      };
      const membershipLabel = membershipLabels[membershipType] || membershipType;

      // Construct invite link
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPLIT_DOMAINS?.split(",")[0]
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
          : "https://docuwhisper.com";
      const inviteLink = `${baseUrl}/invite/${code}`;

      // Send email using Resend
      const resend = new Resend(process.env.RESEND_API_KEY);
      const greeting = patientName ? `Dear ${patientName}` : "Hello";
      
      const { error: emailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "DocuWhisper <onboarding@resend.dev>",
        to: email,
        subject: "Your DocuWhisper Invitation",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #0d9488; margin-bottom: 24px;">Welcome to DocuWhisper</h1>
            <p style="font-size: 16px; color: #374151; line-height: 1.6;">
              ${greeting},
            </p>
            <p style="font-size: 16px; color: #374151; line-height: 1.6;">
              You've been invited to try DocuWhisper, the AI-powered medical scribing tool that helps healthcare providers 
              save hours every day by automatically transcribing consultations into structured SOAP notes.
            </p>
            <p style="font-size: 16px; color: #374151; line-height: 1.6;">
              <strong>Your invitation includes: ${membershipLabel}</strong>
            </p>
            <div style="margin: 32px 0; text-align: center;">
              <a href="${inviteLink}" style="background-color: #0d9488; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block;">
                Accept Invitation
              </a>
            </div>
            <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
              Or copy and paste this link into your browser:<br/>
              <a href="${inviteLink}" style="color: #0d9488;">${inviteLink}</a>
            </p>
            <p style="font-size: 14px; color: #6b7280; margin-top: 32px;">
              Your invite code: <strong>${code}</strong>
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;"/>
            <p style="font-size: 12px; color: #9ca3af;">
              This invitation was sent from DocuWhisper. If you didn't expect this email, you can safely ignore it.
            </p>
          </div>
        `,
      });

      if (emailError) {
        console.error("Error sending email:", emailError);
        // Delete the invite since email failed
        await storage.deleteInvite(invite.id);
        return res.status(500).json({ error: "Failed to send email. Please check your Resend configuration." });
      }

      res.status(201).json({ 
        success: true, 
        invite,
        message: `Invite sent to ${email}` 
      });
    } catch (error) {
      console.error("Error sending invite email:", error);
      res.status(500).json({ error: "Failed to send invite email" });
    }
  });

  // Admin: Update user settings (EMR role, access, etc.)
  app.put("/api/admin/users/:userId/settings", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { userId } = req.params;
      const { emrRole, requiresCosignature, supervisingPhysicianId, hasEmrAccess } = req.body;
      
      // Build settings object for upsert
      const settingsData: any = { userId };
      if (emrRole !== undefined) settingsData.emrRole = emrRole;
      if (requiresCosignature !== undefined) settingsData.requiresCosignature = requiresCosignature;
      if (supervisingPhysicianId !== undefined) settingsData.supervisingPhysicianId = supervisingPhysicianId;
      
      // Upsert user settings
      const updatedSettings = await storage.upsertUserSettings(settingsData);
      
      // Also update subscription EMR access if provided
      if (hasEmrAccess !== undefined) {
        await storage.updateSubscription(userId, { hasEmrAccess });
      }
      
      res.json(updatedSettings);
    } catch (error) {
      console.error("Error updating user settings:", error);
      res.status(500).json({ error: "Failed to update user settings" });
    }
  });

  // Admin: Get full user details (settings + subscription)
  app.get("/api/admin/users/:userId/details", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { userId } = req.params;
      
      const settings = await storage.getUserSettings(userId);
      const subscription = await storage.getSubscription(userId);
      
      res.json({
        settings,
        subscription,
      });
    } catch (error) {
      console.error("Error getting user details:", error);
      res.status(500).json({ error: "Failed to get user details" });
    }
  });

  // Admin: Get organization members with details
  app.get("/api/admin/organizations/:id/members", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const organizationId = parseInt(req.params.id);
      const members = await storage.getPracticeMembers(organizationId);
      res.json(members);
    } catch (error) {
      console.error("Error getting organization members:", error);
      res.status(500).json({ error: "Failed to get members" });
    }
  });

  // Admin: Update organization member role
  app.put("/api/admin/organizations/:id/members/:userId", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const organizationId = parseInt(req.params.id);
      const { userId } = req.params;
      const { role } = req.body;
      
      const updated = await storage.updatePracticeMemberRole(organizationId, userId, role);
      
      if (!updated) {
        return res.status(404).json({ error: "Member not found" });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating member:", error);
      res.status(500).json({ error: "Failed to update member" });
    }
  });

  // Admin: Remove organization member
  app.delete("/api/admin/organizations/:id/members/:userId", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const organizationId = parseInt(req.params.id);
      const { userId } = req.params;
      
      await storage.removePracticeMember(organizationId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ error: "Failed to remove member" });
    }
  });

  // Redeem invite code (any authenticated user)
  app.post("/api/invites/redeem", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { code } = req.body;
      const userId = req.user.claims.sub;

      if (!code) {
        return res.status(400).json({ error: "Invite code is required" });
      }

      const invite = await storage.getInviteByCode(code);

      if (!invite) {
        return res.status(404).json({ error: "Invalid invite code" });
      }

      if (invite.usedBy) {
        return res.status(400).json({ error: "This invite code has already been used" });
      }

      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ error: "This invite code has expired" });
      }

      // Check if this is an EMR-only invite (grants EMR access to existing subscribers)
      const isEmrOnlyInvite = invite.membershipType === "emr_access";
      
      // Calculate membership end date based on type
      const now = new Date();
      let newPeriodEnd: Date | null = null;
      let grantEmrAccess = false;

      switch (invite.membershipType) {
        case "trial_7":
          newPeriodEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case "trial_14":
          newPeriodEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
          break;
        case "trial_30":
          newPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          break;
        case "months_1":
          newPeriodEnd = new Date(now);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
          break;
        case "months_3":
          newPeriodEnd = new Date(now);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 3);
          break;
        case "months_6":
          newPeriodEnd = new Date(now);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 6);
          break;
        case "months_12":
          newPeriodEnd = new Date(now);
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
          break;
        case "lifetime":
          newPeriodEnd = new Date(now);
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 100);
          break;
        // EMR-only invite - grants EMR access to existing subscribers
        case "emr_access":
          grantEmrAccess = true;
          break;
        // EMR + subscription combo invites
        case "emr_trial_30":
          newPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          grantEmrAccess = true;
          break;
        case "emr_months_1":
          newPeriodEnd = new Date(now);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
          grantEmrAccess = true;
          break;
        case "emr_months_12":
          newPeriodEnd = new Date(now);
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
          grantEmrAccess = true;
          break;
        case "emr_lifetime":
          newPeriodEnd = new Date(now);
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 100);
          grantEmrAccess = true;
          break;
        default:
          return res.status(400).json({ error: "Invalid membership type" });
      }

      // Mark invite as used
      await storage.useInvite(code, userId);

      // For EMR-only invites, just grant EMR access (requires active subscription)
      if (isEmrOnlyInvite) {
        const existingSub = await storage.getSubscription(userId);
        if (!existingSub || existingSub.status !== "active") {
          return res.status(400).json({ error: "EMR access requires an active subscription. Please subscribe first." });
        }
        await storage.grantEmrAccess(userId);
        return res.json({ 
          success: true, 
          membershipType: invite.membershipType,
          emrAccessGranted: true
        });
      }

      // Update or create subscription with optional EMR access
      if (newPeriodEnd) {
        await storage.upsertSubscription({
          userId,
          status: "active",
          currentPeriodEnd: newPeriodEnd,
        });
        
        // Grant EMR access if applicable
        if (grantEmrAccess) {
          await storage.grantEmrAccess(userId);
        }
      }

      res.json({ 
        success: true, 
        membershipType: invite.membershipType,
        expiresAt: newPeriodEnd,
        emrAccessGranted: grantEmrAccess
      });
    } catch (error) {
      console.error("Error redeeming invite:", error);
      res.status(500).json({ error: "Failed to redeem invite" });
    }
  });

  // ========== TASK ROUTES ==========
  
  // Get all tasks for current user
  app.get("/api/tasks", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const tasks = await storage.getTasksByUser(userId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Get single task
  app.get("/api/tasks/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      // Verify ownership
      const userId = req.user.claims.sub;
      if (task.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ error: "Failed to fetch task" });
    }
  });

  // Create new task
  app.post("/api/tasks", isAuthenticated, async (req: any, res: Response) => {
    try {
      const validationResult = createTaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.flatten().fieldErrors });
      }
      
      const userId = req.user.claims.sub;
      const task = await storage.createTask({
        ...validationResult.data,
        userId,
      });
      
      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  // Update task
  app.patch("/api/tasks/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      // Verify ownership
      const userId = req.user.claims.sub;
      if (task.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const validationResult = updateTaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: "Validation failed", details: validationResult.error.flatten().fieldErrors });
      }
      
      const updated = await storage.updateTask(taskId, validationResult.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  // Delete task
  app.delete("/api/tasks/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      // Verify ownership
      const userId = req.user.claims.sub;
      if (task.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await storage.deleteTask(taskId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // Complete task
  app.post("/api/tasks/:id/complete", isAuthenticated, async (req: any, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      // Verify ownership
      const userId = req.user.claims.sub;
      if (task.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const updated = await storage.completeTask(taskId);
      res.json(updated);
    } catch (error) {
      console.error("Error completing task:", error);
      res.status(500).json({ error: "Failed to complete task" });
    }
  });

  // Uncomplete task (reopen)
  app.post("/api/tasks/:id/uncomplete", isAuthenticated, async (req: any, res: Response) => {
    try {
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      // Verify ownership
      const userId = req.user.claims.sub;
      if (task.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const updated = await storage.uncompleteTask(taskId);
      res.json(updated);
    } catch (error) {
      console.error("Error uncompleting task:", error);
      res.status(500).json({ error: "Failed to uncomplete task" });
    }
  });

  // Get tasks by note
  app.get("/api/notes/:noteId/tasks", isAuthenticated, async (req: any, res: Response) => {
    try {
      const noteId = parseInt(req.params.noteId);
      const note = await storage.getNote(noteId);
      
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      // Verify ownership
      const userId = req.user.claims.sub;
      if (note.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const tasks = await storage.getTasksByNote(noteId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks for note:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Analytics endpoint
  app.get("/api/analytics", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const analytics = await storage.getAnalytics(userId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // Public templates
  app.get("/api/templates/public", isAuthenticated, async (req: any, res: Response) => {
    try {
      const templates = await storage.getPublicTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching public templates:", error);
      res.status(500).json({ error: "Failed to fetch public templates" });
    }
  });

  // Shared templates (templates shared with current user)
  app.get("/api/templates/shared", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const templates = await storage.getSharedTemplates(userId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching shared templates:", error);
      res.status(500).json({ error: "Failed to fetch shared templates" });
    }
  });

  // Clone a public or shared template
  app.post("/api/templates/:id/clone", isAuthenticated, async (req: any, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      const original = await storage.getTemplate(templateId);
      
      if (!original) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      const userId = req.user.claims.sub;
      
      // Check if user can access this template (owns it, is public, or shared with them)
      if (original.userId !== userId && !original.isPublic && !(original.sharedWith?.includes(userId))) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const cloned = await storage.createTemplate({
        userId,
        name: `${original.name} (Copy)`,
        description: original.description,
        prompt: original.prompt,
        isDefault: false,
        isPublic: false,
      });
      
      res.status(201).json(cloned);
    } catch (error) {
      console.error("Error cloning template:", error);
      res.status(500).json({ error: "Failed to clone template" });
    }
  });

  // ========== PRACTICE/TEAM MANAGEMENT ROUTES ==========
  
  // Get all practices user belongs to
  app.get("/api/practices", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const practices = await storage.getUserPractices(userId);
      res.json(practices);
    } catch (error) {
      console.error("Error fetching practices:", error);
      res.status(500).json({ error: "Failed to fetch practices" });
    }
  });

  // Create a new practice
  app.post("/api/practices", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const ownerEmail = process.env.OWNER_EMAIL;
      
      // Only the owner can create practices
      const isOwner = ownerEmail && userEmail && userEmail.toLowerCase() === ownerEmail.toLowerCase();
      if (!isOwner) {
        return res.status(403).json({ error: "Only the system owner can create practices" });
      }
      
      const { name, description } = req.body;
      
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Practice name is required" });
      }
      
      const practice = await storage.createPractice({
        name: name.trim(),
        ownerId: userId,
        description: description || null,
      });
      
      res.status(201).json(practice);
    } catch (error) {
      console.error("Error creating practice:", error);
      res.status(500).json({ error: "Failed to create practice" });
    }
  });

  // Update a practice
  app.patch("/api/practices/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }
      
      if (practice.ownerId !== userId) {
        return res.status(403).json({ error: "Only the owner can update the practice" });
      }
      
      const { name, description } = req.body;
      const updated = await storage.updatePractice(practiceId, {
        name: name || practice.name,
        description: description !== undefined ? description : practice.description,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating practice:", error);
      res.status(500).json({ error: "Failed to update practice" });
    }
  });

  // Delete a practice
  app.delete("/api/practices/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }
      
      if (practice.ownerId !== userId) {
        return res.status(403).json({ error: "Only the owner can delete the practice" });
      }
      
      await storage.deletePractice(practiceId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting practice:", error);
      res.status(500).json({ error: "Failed to delete practice" });
    }
  });

  // Get practice members
  app.get("/api/practices/:id/members", isAuthenticated, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      // Check if user is a member of this practice
      const userPractices = await storage.getUserPractices(userId);
      const isMember = userPractices.some(p => p.practice.id === practiceId);
      
      if (!isMember) {
        return res.status(403).json({ error: "Not a member of this practice" });
      }
      
      const members = await storage.getPracticeMembers(practiceId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching practice members:", error);
      res.status(500).json({ error: "Failed to fetch practice members" });
    }
  });

  // Add a member to practice (by user ID - simplified for now)
  app.post("/api/practices/:id/members", isAuthenticated, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const currentUserId = req.user.claims.sub;
      const { userId, role = "member" } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }
      
      // Check if current user is owner or admin
      const userPractices = await storage.getUserPractices(currentUserId);
      const membership = userPractices.find(p => p.practice.id === practiceId);
      
      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return res.status(403).json({ error: "Only owners and admins can add members" });
      }
      
      const member = await storage.addPracticeMember({
        practiceId,
        userId,
        role: role === "admin" ? "admin" : "member",
        invitedBy: currentUserId,
      });
      
      res.status(201).json(member);
    } catch (error) {
      console.error("Error adding practice member:", error);
      res.status(500).json({ error: "Failed to add practice member" });
    }
  });

  // Remove a member from practice
  app.delete("/api/practices/:id/members/:userId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const targetUserId = req.params.userId;
      const currentUserId = req.user.claims.sub;
      
      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }
      
      // Check if current user is owner or admin (or removing themselves)
      const userPractices = await storage.getUserPractices(currentUserId);
      const membership = userPractices.find(p => p.practice.id === practiceId);
      
      const canRemove = currentUserId === targetUserId || 
        (membership && (membership.role === "owner" || membership.role === "admin"));
      
      if (!canRemove) {
        return res.status(403).json({ error: "Not authorized to remove this member" });
      }
      
      // Can't remove the owner
      if (targetUserId === practice.ownerId) {
        return res.status(400).json({ error: "Cannot remove the practice owner" });
      }
      
      await storage.removePracticeMember(practiceId, targetUserId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing practice member:", error);
      res.status(500).json({ error: "Failed to remove practice member" });
    }
  });

  // ========== ORGANIZATION EMR MEMBER MANAGEMENT ==========

  // Get user's EMR organizations
  app.get("/api/emr/organizations", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const ownerEmail = process.env.OWNER_EMAIL;

      // Owner (vendor) gets all organizations with EMR
      if (ownerEmail && userEmail === ownerEmail) {
        const allOrgs = await storage.getAllOrganizationsWithEmr();
        res.json(allOrgs.map(org => ({ practice: org, emrRole: 'vendor' })));
        return;
      }

      // Regular users get their EMR organizations
      const emrOrgs = await storage.getUserEmrOrganizations(userId);
      res.json(emrOrgs);
    } catch (error) {
      console.error("Error fetching EMR organizations:", error);
      res.status(500).json({ error: "Failed to fetch EMR organizations" });
    }
  });

  // Grant EMR access to a member within organization (org admin or owner only)
  app.post("/api/practices/:id/emr-access", isAuthenticated, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const currentUserId = req.user.claims.sub;
      const currentUserEmail = req.user.claims.email;
      const { userId, emrRole = "provider" } = req.body;
      const ownerEmail = process.env.OWNER_EMAIL;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }

      if (!practice.hasEmrLicense) {
        return res.status(400).json({ error: "Organization does not have an EMR license" });
      }

      // Check authorization: must be owner, practice owner, or practice admin/emr_admin
      const isVendorOwner = ownerEmail && currentUserEmail === ownerEmail;
      const userPractices = await storage.getUserPractices(currentUserId);
      const membership = userPractices.find(p => p.practice.id === practiceId);
      const isOrgOwnerOrAdmin = practice.ownerId === currentUserId || 
        (membership && (membership.role === "owner" || membership.role === "admin"));

      // Also check if user is EMR admin within the organization
      const practiceMembers = await storage.getPracticeMembers(practiceId);
      const currentMember = practiceMembers.find(m => m.userId === currentUserId);
      const isEmrAdmin = currentMember?.emrRole === "emr_admin";

      if (!isVendorOwner && !isOrgOwnerOrAdmin && !isEmrAdmin) {
        return res.status(403).json({ error: "Not authorized to grant EMR access" });
      }

      // Check if target user is a member of this practice
      const targetMember = practiceMembers.find(m => m.userId === userId);
      if (!targetMember) {
        return res.status(400).json({ error: "User is not a member of this organization" });
      }

      const updated = await storage.grantEmrAccessToMember(practiceId, userId, emrRole);
      res.json(updated);
    } catch (error: any) {
      console.error("Error granting EMR access to member:", error);
      res.status(500).json({ error: error.message || "Failed to grant EMR access" });
    }
  });

  // Revoke EMR access from a member within organization (org admin or owner only)
  app.delete("/api/practices/:id/emr-access/:userId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const targetUserId = req.params.userId;
      const currentUserId = req.user.claims.sub;
      const currentUserEmail = req.user.claims.email;
      const ownerEmail = process.env.OWNER_EMAIL;

      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }

      // Check authorization
      const isVendorOwner = ownerEmail && currentUserEmail === ownerEmail;
      const userPractices = await storage.getUserPractices(currentUserId);
      const membership = userPractices.find(p => p.practice.id === practiceId);
      const isOrgOwnerOrAdmin = practice.ownerId === currentUserId || 
        (membership && (membership.role === "owner" || membership.role === "admin"));

      const practiceMembers = await storage.getPracticeMembers(practiceId);
      const currentMember = practiceMembers.find(m => m.userId === currentUserId);
      const isEmrAdmin = currentMember?.emrRole === "emr_admin";

      if (!isVendorOwner && !isOrgOwnerOrAdmin && !isEmrAdmin) {
        return res.status(403).json({ error: "Not authorized to revoke EMR access" });
      }

      const updated = await storage.revokeEmrAccessFromMember(practiceId, targetUserId);
      res.json(updated);
    } catch (error) {
      console.error("Error revoking EMR access from member:", error);
      res.status(500).json({ error: "Failed to revoke EMR access" });
    }
  });

  // Update EMR role for a member (org admin or owner only)
  app.patch("/api/practices/:id/emr-role/:userId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const targetUserId = req.params.userId;
      const currentUserId = req.user.claims.sub;
      const currentUserEmail = req.user.claims.email;
      const { emrRole } = req.body;
      const ownerEmail = process.env.OWNER_EMAIL;

      if (!emrRole) {
        return res.status(400).json({ error: "emrRole is required" });
      }

      const validRoles = ["emr_admin", "provider", "staff", "readonly"];
      if (!validRoles.includes(emrRole)) {
        return res.status(400).json({ error: "Invalid emrRole. Must be: emr_admin, provider, staff, or readonly" });
      }

      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }

      // Check authorization
      const isVendorOwner = ownerEmail && currentUserEmail === ownerEmail;
      const userPractices = await storage.getUserPractices(currentUserId);
      const membership = userPractices.find(p => p.practice.id === practiceId);
      const isOrgOwnerOrAdmin = practice.ownerId === currentUserId || 
        (membership && (membership.role === "owner" || membership.role === "admin"));

      const practiceMembers = await storage.getPracticeMembers(practiceId);
      const currentMember = practiceMembers.find(m => m.userId === currentUserId);
      const isEmrAdmin = currentMember?.emrRole === "emr_admin";

      if (!isVendorOwner && !isOrgOwnerOrAdmin && !isEmrAdmin) {
        return res.status(403).json({ error: "Not authorized to update EMR role" });
      }

      const updated = await storage.updateMemberEmrRole(practiceId, targetUserId, emrRole);
      res.json(updated);
    } catch (error) {
      console.error("Error updating EMR role:", error);
      res.status(500).json({ error: "Failed to update EMR role" });
    }
  });

  // Get EMR members for an organization (any member with EMR access can view)
  app.get("/api/practices/:id/emr-members", isAuthenticated, async (req: any, res: Response) => {
    try {
      const practiceId = parseInt(req.params.id);
      const currentUserId = req.user.claims.sub;
      const currentUserEmail = req.user.claims.email;
      const ownerEmail = process.env.OWNER_EMAIL;

      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }

      // Check if user has access (owner, member of org, or vendor owner)
      const isVendorOwner = ownerEmail && currentUserEmail === ownerEmail;
      const userPractices = await storage.getUserPractices(currentUserId);
      const isMember = userPractices.some(p => p.practice.id === practiceId);

      if (!isVendorOwner && !isMember) {
        return res.status(403).json({ error: "Not authorized to view EMR members" });
      }

      const members = await storage.getOrganizationEmrMembers(practiceId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching EMR members:", error);
      res.status(500).json({ error: "Failed to fetch EMR members" });
    }
  });

  // ========== NOTE SHARING ROUTES ==========
  
  // Share a note with a user or practice
  app.post("/api/notes/:id/share", isAuthenticated, async (req: any, res: Response) => {
    try {
      const noteId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      const { sharedWithUserId, sharedWithPracticeId, permission = "view" } = req.body;
      
      const note = await storage.getNote(noteId);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      if (note.userId !== userId) {
        return res.status(403).json({ error: "Only the note owner can share it" });
      }
      
      if (!sharedWithUserId && !sharedWithPracticeId) {
        return res.status(400).json({ error: "Must specify a user or practice to share with" });
      }
      
      // If sharing to a practice, verify the user is a member of that practice
      if (sharedWithPracticeId) {
        const userPractices = await storage.getUserPractices(userId);
        const isMember = userPractices.some(p => p.practice.id === parseInt(sharedWithPracticeId));
        
        if (!isMember) {
          return res.status(403).json({ error: "You can only share notes with practices you belong to" });
        }
      }
      
      const sharedNote = await storage.shareNote({
        noteId,
        sharedBy: userId,
        sharedWithUserId: sharedWithUserId || null,
        sharedWithPracticeId: sharedWithPracticeId ? parseInt(sharedWithPracticeId) : null,
        permission,
      });
      
      res.status(201).json(sharedNote);
    } catch (error) {
      console.error("Error sharing note:", error);
      res.status(500).json({ error: "Failed to share note" });
    }
  });

  // Get sharing info for a note
  app.get("/api/notes/:id/shares", isAuthenticated, async (req: any, res: Response) => {
    try {
      const noteId = parseInt(req.params.id);
      const userId = req.user.claims.sub;
      
      const note = await storage.getNote(noteId);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      if (note.userId !== userId) {
        return res.status(403).json({ error: "Only the note owner can view sharing info" });
      }
      
      const shares = await storage.getNoteShareInfo(noteId);
      res.json(shares);
    } catch (error) {
      console.error("Error fetching note shares:", error);
      res.status(500).json({ error: "Failed to fetch note shares" });
    }
  });

  // Unshare a note
  app.delete("/api/notes/shares/:shareId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const shareId = parseInt(req.params.shareId);
      const userId = req.user.claims.sub;
      
      // Get the specific share record
      const share = await storage.getShareById(shareId);
      
      if (!share) {
        return res.status(404).json({ error: "Share not found" });
      }
      
      // Get the actual note to verify ownership (defense in depth)
      const note = await storage.getNote(share.noteId);
      
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      // Verify the current user owns the note (primary check)
      if (note.userId !== userId) {
        return res.status(403).json({ error: "Only the note owner can unshare it" });
      }
      
      await storage.unshareNote(shareId);
      res.status(204).send();
    } catch (error) {
      console.error("Error unsharing note:", error);
      res.status(500).json({ error: "Failed to unshare note" });
    }
  });

  // Get notes shared with current user
  app.get("/api/shared-notes", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const sharedNotes = await storage.getSharedNotesForUser(userId);
      res.json(sharedNotes);
    } catch (error) {
      console.error("Error fetching shared notes:", error);
      res.status(500).json({ error: "Failed to fetch shared notes" });
    }
  });

  // ========== ADVANCED ANALYTICS ROUTES ==========
  
  // Get productivity trends (notes per day over time)
  app.get("/api/analytics/productivity", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const days = parseInt(req.query.days as string) || 30;
      
      const trends = await storage.getProductivityTrends(userId, Math.min(days, 90)); // Max 90 days
      res.json(trends);
    } catch (error) {
      console.error("Error fetching productivity trends:", error);
      res.status(500).json({ error: "Failed to fetch productivity trends" });
    }
  });

  // Get trending diagnoses
  app.get("/api/analytics/diagnoses", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const diagnoses = await storage.getTrendingDiagnoses(userId);
      res.json(diagnoses);
    } catch (error) {
      console.error("Error fetching trending diagnoses:", error);
      res.status(500).json({ error: "Failed to fetch trending diagnoses" });
    }
  });

  // ========== EMR ROUTES ==========

  // Check EMR access status
  app.get("/api/emr/access", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const ownerEmail = process.env.OWNER_EMAIL;
      
      const subscription = await storage.getSubscription(userId);
      const settings = await storage.getUserSettings(userId);
      const emrOrgs = await storage.getUserEmrOrganizations(userId);
      
      // Check if user is owner (vendor)
      const isVendorOwner = ownerEmail && userEmail === ownerEmail;
      
      // Has access if: owner, individual EMR access, or org-based EMR access
      const hasIndividualAccess = subscription?.hasEmrAccess === true && subscription?.status === "active";
      const hasOrgAccess = emrOrgs.length > 0;
      const hasAccess = isVendorOwner || hasIndividualAccess || hasOrgAccess;
      
      // For owner, get all EMR organizations
      let organizations = emrOrgs;
      if (isVendorOwner) {
        const allOrgs = await storage.getAllOrganizationsWithEmr();
        organizations = allOrgs.map(org => ({ practice: org, emrRole: 'vendor' as string | null }));
      }
      
      res.json({
        hasAccess,
        isVendorOwner,
        subscriptionStatus: subscription?.status || "none",
        consentAcknowledged: settings?.emrConsentAcknowledged || false,
        consentDate: settings?.emrConsentDate,
        organizations, // List of orgs user has EMR access to
        accessType: isVendorOwner ? 'vendor' : hasIndividualAccess ? 'individual' : hasOrgAccess ? 'organization' : 'none',
      });
    } catch (error) {
      console.error("Error checking EMR access:", error);
      res.status(500).json({ error: "Failed to check EMR access" });
    }
  });

  // Acknowledge EMR/PHI consent (HIPAA requirement)
  app.post("/api/emr/consent", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const subscription = await storage.getSubscription(userId);
      
      // Verify user has EMR access before allowing consent
      if (!subscription?.hasEmrAccess || subscription?.status !== "active") {
        return res.status(403).json({ error: "EMR access not enabled" });
      }
      
      // Update user settings with consent acknowledgment
      const updated = await storage.upsertUserSettings({
        userId,
        emrConsentAcknowledged: true,
        emrConsentDate: new Date(),
      });
      
      // Log consent acknowledgment
      await logAudit(req, 'consent_acknowledged', 'emr_access', undefined, undefined, {
        consentType: 'hipaa_phi_access',
        acknowledgmentDate: new Date().toISOString()
      });
      
      res.json({ 
        success: true, 
        consentAcknowledged: updated?.emrConsentAcknowledged,
        consentDate: updated?.emrConsentDate 
      });
    } catch (error) {
      console.error("Error acknowledging consent:", error);
      res.status(500).json({ error: "Failed to acknowledge consent" });
    }
  });

  // ========== EMR PATIENT ROUTES ==========

  // Get all patients - for vendors filter by organization, for regular users by their organization access
  app.get("/api/emr/patients", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const organizationId = req.query.organizationId ? parseInt(req.query.organizationId as string) : null;
      
      // Check if user is owner (vendor)
      const ownerEmail = process.env.OWNER_EMAIL;
      const userEmail = req.user.claims.email;
      const isVendor = ownerEmail && userEmail && userEmail.toLowerCase() === ownerEmail.toLowerCase();
      
      if (isVendor && organizationId) {
        // Vendor can access any organization's patients
        const patients = await storage.getPatientsByOrganization(organizationId);
        res.json(patients);
      } else if (organizationId) {
        // Check if user has access to this organization
        const members = await storage.getPracticeMembers(organizationId);
        const isMember = members.some((m: { userId: string }) => m.userId === userId);
        if (isMember) {
          const patients = await storage.getPatientsByOrganization(organizationId);
          res.json(patients);
        } else {
          res.status(403).json({ error: "Access denied to this organization" });
        }
      } else {
        // Default: get patients by user
        const patients = await storage.getPatientsByUser(userId);
        res.json(patients);
      }
    } catch (error) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ error: "Failed to fetch patients" });
    }
  });

  // Search patients
  app.get("/api/emr/patients/search", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const query = req.query.q as string || "";
      
      if (query.length < 2) {
        return res.json([]);
      }
      
      const patients = await storage.searchPatients(userId, query);
      res.json(patients);
    } catch (error) {
      console.error("Error searching patients:", error);
      res.status(500).json({ error: "Failed to search patients" });
    }
  });

  // Get single patient
  app.get("/api/emr/patients/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const patientId = parseInt(req.params.id);
      
      const patient = await storage.getPatient(patientId);
      if (!patient || patient.userId !== userId) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      // HIPAA audit log - patient record viewed
      await logAudit(req, 'view', 'patient', patientId, patientId, { patientName: `${patient.firstName} ${patient.lastName}` });
      
      res.json(patient);
    } catch (error) {
      console.error("Error fetching patient:", error);
      res.status(500).json({ error: "Failed to fetch patient" });
    }
  });

  // Create patient
  app.post("/api/emr/patients", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const parsed = createPatientSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      
      const patient = await storage.createPatient({
        ...parsed.data,
        userId,
      });
      
      // HIPAA audit log - patient record created
      await logAudit(req, 'create', 'patient', patient.id, patient.id, { patientName: `${patient.firstName} ${patient.lastName}` });
      
      res.status(201).json(patient);
    } catch (error) {
      console.error("Error creating patient:", error);
      res.status(500).json({ error: "Failed to create patient" });
    }
  });

  // Update patient
  app.patch("/api/emr/patients/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const patientId = parseInt(req.params.id);
      
      const patient = await storage.getPatient(patientId);
      if (!patient || patient.userId !== userId) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      const parsed = createPatientSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      
      const updated = await storage.updatePatient(patientId, parsed.data);
      
      // HIPAA audit log - patient record updated
      await logAudit(req, 'update', 'patient', patientId, patientId, { fieldsUpdated: Object.keys(parsed.data) });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating patient:", error);
      res.status(500).json({ error: "Failed to update patient" });
    }
  });

  // Delete patient
  app.delete("/api/emr/patients/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const patientId = parseInt(req.params.id);
      
      const patient = await storage.getPatient(patientId);
      if (!patient || patient.userId !== userId) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      // HIPAA audit log - patient record deleted (log before deletion)
      await logAudit(req, 'delete', 'patient', patientId, patientId, { patientName: `${patient.firstName} ${patient.lastName}` });
      
      await storage.deletePatient(patientId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting patient:", error);
      res.status(500).json({ error: "Failed to delete patient" });
    }
  });

  // Get notes linked to a patient
  app.get("/api/emr/patients/:id/notes", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const patientId = parseInt(req.params.id);
      
      const patient = await storage.getPatient(patientId);
      if (!patient || patient.userId !== userId) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      const notes = await storage.getNotesByPatient(patientId);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching patient notes:", error);
      res.status(500).json({ error: "Failed to fetch patient notes" });
    }
  });

  // Link a note to a patient
  app.post("/api/emr/patients/:id/notes/:noteId", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const patientId = parseInt(req.params.id);
      const noteId = parseInt(req.params.noteId);
      
      const patient = await storage.getPatient(patientId);
      if (!patient || patient.userId !== userId) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      const note = await storage.getNote(noteId);
      if (!note || note.userId !== userId) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      const updated = await storage.linkNoteToPatient(noteId, patientId);
      res.json(updated);
    } catch (error) {
      console.error("Error linking note to patient:", error);
      res.status(500).json({ error: "Failed to link note to patient" });
    }
  });

  // ========== EMR APPOINTMENT ROUTES ==========

  // Get all appointments - for vendors filter by organization
  app.get("/api/emr/appointments", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const organizationId = req.query.organizationId ? parseInt(req.query.organizationId as string) : null;
      
      // Check if user is owner (vendor)
      const ownerEmail = process.env.OWNER_EMAIL;
      const userEmail = req.user.claims.email;
      const isVendor = ownerEmail && userEmail && userEmail.toLowerCase() === ownerEmail.toLowerCase();
      
      if (isVendor && organizationId) {
        // Vendor can access any organization's appointments
        const appointments = await storage.getAppointmentsByOrganization(organizationId);
        res.json(appointments);
      } else if (organizationId) {
        // Check if user has access to this organization
        const members = await storage.getPracticeMembers(organizationId);
        const isMember = members.some((m: { userId: string }) => m.userId === userId);
        if (isMember) {
          const appointments = await storage.getAppointmentsByOrganization(organizationId);
          res.json(appointments);
        } else {
          res.status(403).json({ error: "Access denied to this organization" });
        }
      } else {
        // Default: get appointments by user
        const appointments = await storage.getAppointmentsByUser(userId);
        res.json(appointments);
      }
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ error: "Failed to fetch appointments" });
    }
  });

  // Get upcoming appointments - for vendors filter by organization
  app.get("/api/emr/appointments/upcoming", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const days = parseInt(req.query.days as string) || 7;
      const organizationId = req.query.organizationId ? parseInt(req.query.organizationId as string) : null;
      
      // Check if user is owner (vendor)
      const ownerEmail = process.env.OWNER_EMAIL;
      const userEmail = req.user.claims.email;
      const isVendor = ownerEmail && userEmail && userEmail.toLowerCase() === ownerEmail.toLowerCase();
      
      if (isVendor && organizationId) {
        const appointments = await storage.getUpcomingAppointmentsByOrganization(organizationId, Math.min(days, 90));
        res.json(appointments);
      } else if (organizationId) {
        const members = await storage.getPracticeMembers(organizationId);
        const isMember = members.some((m: { userId: string }) => m.userId === userId);
        if (isMember) {
          const appointments = await storage.getUpcomingAppointmentsByOrganization(organizationId, Math.min(days, 90));
          res.json(appointments);
        } else {
          res.status(403).json({ error: "Access denied to this organization" });
        }
      } else {
        const appointments = await storage.getUpcomingAppointments(userId, Math.min(days, 90));
        res.json(appointments);
      }
    } catch (error) {
      console.error("Error fetching upcoming appointments:", error);
      res.status(500).json({ error: "Failed to fetch upcoming appointments" });
    }
  });

  // Get appointments by patient
  app.get("/api/emr/patients/:id/appointments", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const patientId = parseInt(req.params.id);
      
      const patient = await storage.getPatient(patientId);
      if (!patient || patient.userId !== userId) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      const appointments = await storage.getAppointmentsByPatient(patientId);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching patient appointments:", error);
      res.status(500).json({ error: "Failed to fetch patient appointments" });
    }
  });

  // Get single appointment
  app.get("/api/emr/appointments/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const appointmentId = parseInt(req.params.id);
      
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment || appointment.userId !== userId) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      
      res.json(appointment);
    } catch (error) {
      console.error("Error fetching appointment:", error);
      res.status(500).json({ error: "Failed to fetch appointment" });
    }
  });

  // Create appointment
  app.post("/api/emr/appointments", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const ownerEmail = process.env.OWNER_EMAIL;
      const isVendor = ownerEmail && userEmail && userEmail.toLowerCase() === ownerEmail.toLowerCase();
      
      const parsed = createAppointmentSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      
      // Verify patient access - either owner, direct owner, or organization member
      const patient = await storage.getPatient(parsed.data.patientId);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      // Check if user has access to this patient
      let hasAccess = patient.userId === userId;
      
      // Check if vendor has access
      if (!hasAccess && isVendor) {
        hasAccess = true;
      }
      
      // Check if user is member of patient's organization
      if (!hasAccess && patient.organizationId) {
        const members = await storage.getPracticeMembers(patient.organizationId);
        hasAccess = members.some((m: { userId: string }) => m.userId === userId);
      }
      
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied to this patient" });
      }
      
      const appointment = await storage.createAppointment({
        ...parsed.data,
        userId,
      });
      
      // Audit log for appointment creation
      await logAudit(req, 'create', 'appointment', appointment.id, appointment.patientId, {
        appointmentType: appointment.appointmentType,
        startTime: appointment.startTime
      });
      
      res.status(201).json(appointment);
    } catch (error) {
      console.error("Error creating appointment:", error);
      res.status(500).json({ error: "Failed to create appointment" });
    }
  });

  // Update appointment
  app.patch("/api/emr/appointments/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const appointmentId = parseInt(req.params.id);
      
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment || appointment.userId !== userId) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      
      const parsed = createAppointmentSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      
      const updated = await storage.updateAppointment(appointmentId, parsed.data);
      
      // Audit log for appointment update
      if (updated) {
        await logAudit(req, 'update', 'appointment', appointmentId, updated.patientId);
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ error: "Failed to update appointment" });
    }
  });

  // Delete appointment
  app.delete("/api/emr/appointments/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const appointmentId = parseInt(req.params.id);
      
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment || appointment.userId !== userId) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      
      // Audit log for appointment deletion
      await logAudit(req, 'delete', 'appointment', appointmentId, appointment.patientId);
      
      await storage.deleteAppointment(appointmentId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ error: "Failed to delete appointment" });
    }
  });

  // ========== EMR VITALS ROUTES ==========

  // Get vitals history for a patient
  app.get("/api/emr/patients/:id/vitals", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const patientId = parseInt(req.params.id);
      const vitals = await storage.getVitalsByPatient(patientId);
      res.json(vitals);
    } catch (error) {
      console.error("Error fetching vitals:", error);
      res.status(500).json({ error: "Failed to fetch vitals" });
    }
  });

  // Get latest vitals for a patient
  app.get("/api/emr/patients/:id/vitals/latest", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const patientId = parseInt(req.params.id);
      const vitals = await storage.getLatestVitals(patientId);
      res.json(vitals || null);
    } catch (error) {
      console.error("Error fetching latest vitals:", error);
      res.status(500).json({ error: "Failed to fetch latest vitals" });
    }
  });

  // Create vitals record
  app.post("/api/emr/patients/:id/vitals", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      const vitals = await storage.createVitals({
        ...req.body,
        patientId,
        recordedBy: userId,
        organizationId: patient.organizationId,
      });
      
      await logAudit(req, 'create', 'vitals', vitals.id, patientId, { recordedAt: vitals.recordedAt });
      res.status(201).json(vitals);
    } catch (error) {
      console.error("Error creating vitals:", error);
      res.status(500).json({ error: "Failed to create vitals" });
    }
  });

  // Update vitals record
  app.patch("/api/emr/vitals/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const vitalsId = parseInt(req.params.id);
      const vitals = await storage.updateVitals(vitalsId, req.body);
      if (!vitals) {
        return res.status(404).json({ error: "Vitals record not found" });
      }
      res.json(vitals);
    } catch (error) {
      console.error("Error updating vitals:", error);
      res.status(500).json({ error: "Failed to update vitals" });
    }
  });

  // Delete vitals record
  app.delete("/api/emr/vitals/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const vitalsId = parseInt(req.params.id);
      await storage.deleteVitals(vitalsId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting vitals:", error);
      res.status(500).json({ error: "Failed to delete vitals" });
    }
  });

  // ========== EMR ENCOUNTER ROUTES ==========

  // Get encounters for a patient
  app.get("/api/emr/patients/:id/encounters", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const patientId = parseInt(req.params.id);
      const encounters = await storage.getEncountersByPatient(patientId);
      res.json(encounters);
    } catch (error) {
      console.error("Error fetching encounters:", error);
      res.status(500).json({ error: "Failed to fetch encounters" });
    }
  });

  // Get single encounter
  app.get("/api/emr/encounters/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const encounterId = parseInt(req.params.id);
      const encounter = await storage.getEncounter(encounterId);
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      res.json(encounter);
    } catch (error) {
      console.error("Error fetching encounter:", error);
      res.status(500).json({ error: "Failed to fetch encounter" });
    }
  });

  // Create encounter
  app.post("/api/emr/patients/:id/encounters", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const patientId = parseInt(req.params.id);
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      const encounter = await storage.createEncounter({
        ...req.body,
        patientId,
        providerId: userId,
        organizationId: patient.organizationId,
      });
      
      await logAudit(req, 'create', 'encounter', encounter.id, patientId, { encounterType: encounter.encounterType });
      res.status(201).json(encounter);
    } catch (error) {
      console.error("Error creating encounter:", error);
      res.status(500).json({ error: "Failed to create encounter" });
    }
  });

  // Update encounter
  app.patch("/api/emr/encounters/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const encounterId = parseInt(req.params.id);
      const encounter = await storage.updateEncounter(encounterId, req.body);
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      res.json(encounter);
    } catch (error) {
      console.error("Error updating encounter:", error);
      res.status(500).json({ error: "Failed to update encounter" });
    }
  });

  // Sign/finalize encounter
  app.post("/api/emr/encounters/:id/sign", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const encounterId = parseInt(req.params.id);
      
      // Check if user requires co-signature (explicitly set in settings)
      const settings = await storage.getUserSettings(userId);
      const requiresCosign = settings?.requiresCosignature === true;
      
      // Get encounter first to set requiresCosignature flag if needed
      const existingEncounter = await storage.getEncounter(encounterId);
      if (!existingEncounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      
      // If mid-level, set to pending_cosign status instead of signed
      if (requiresCosign) {
        // Update encounter to pending co-signature
        const encounter = await storage.updateEncounter(encounterId, {
          status: "pending_cosign",
          signedAt: new Date(),
          signedBy: userId,
          requiresCosignature: true,
        });
        await logAudit(req, 'update', 'encounter', encounter!.id, encounter!.patientId, { action: 'pending_cosign' });
        res.json(encounter);
      } else {
        // Physician or other - full sign
        const encounter = await storage.signEncounter(encounterId, userId);
        if (!encounter) {
          return res.status(404).json({ error: "Encounter not found" });
        }
        await logAudit(req, 'update', 'encounter', encounter.id, encounter.patientId, { action: 'signed' });
        res.json(encounter);
      }
    } catch (error) {
      console.error("Error signing encounter:", error);
      res.status(500).json({ error: "Failed to sign encounter" });
    }
  });

  // Reopen signed encounter
  app.post("/api/emr/encounters/:id/reopen", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const encounterId = parseInt(req.params.id);
      const encounter = await storage.reopenEncounter(encounterId);
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      await logAudit(req, 'update', 'encounter', encounter.id, encounter.patientId, { action: 'reopened' });
      res.json(encounter);
    } catch (error) {
      console.error("Error reopening encounter:", error);
      res.status(500).json({ error: "Failed to reopen encounter" });
    }
  });

  // Co-sign encounter (for supervising physicians)
  app.post("/api/emr/encounters/:id/cosign", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const encounterId = parseInt(req.params.id);
      const { notes } = req.body;
      
      // Verify user is a physician who can co-sign
      const settings = await storage.getUserSettings(userId);
      if (!settings || settings.emrRole !== 'physician') {
        return res.status(403).json({ error: "Only physicians can co-sign encounters" });
      }
      
      const encounter = await storage.cosignEncounter(encounterId, userId, notes);
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      await logAudit(req, 'update', 'encounter', encounter.id, encounter.patientId, { action: 'cosigned' });
      res.json(encounter);
    } catch (error) {
      console.error("Error co-signing encounter:", error);
      res.status(500).json({ error: "Failed to co-sign encounter" });
    }
  });

  // Get encounters pending co-signature (for supervising physicians)
  app.get("/api/emr/encounters/pending-cosign", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      
      // Verify user is a physician
      const settings = await storage.getUserSettings(userId);
      if (!settings || settings.emrRole !== 'physician') {
        return res.json([]); // Non-physicians have no pending co-signatures
      }
      
      const encounters = await storage.getEncountersPendingCosign(userId);
      res.json(encounters);
    } catch (error) {
      console.error("Error fetching pending co-signatures:", error);
      res.status(500).json({ error: "Failed to fetch pending co-signatures" });
    }
  });

  // Delete encounter
  app.delete("/api/emr/encounters/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const encounterId = parseInt(req.params.id);
      const encounter = await storage.getEncounter(encounterId);
      if (!encounter) {
        return res.status(404).json({ error: "Encounter not found" });
      }
      if (encounter.status === "signed") {
        return res.status(400).json({ error: "Cannot delete signed encounters" });
      }
      await storage.deleteEncounter(encounterId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting encounter:", error);
      res.status(500).json({ error: "Failed to delete encounter" });
    }
  });

  // ========== EMR DOCUMENT ROUTES ==========

  // Get documents for a patient
  app.get("/api/emr/patients/:id/documents", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const patientId = parseInt(req.params.id);
      
      const patient = await storage.getPatient(patientId);
      if (!patient || patient.userId !== userId) {
        return res.status(404).json({ error: "Patient not found" });
      }
      
      const documents = await storage.getDocumentsByPatient(patientId);
      
      // Audit log for document list access
      await logAudit(req, 'view', 'document_list', undefined, patientId, {
        documentCount: documents.length
      });
      
      res.json(documents);
    } catch (error) {
      console.error("Error fetching patient documents:", error);
      res.status(500).json({ error: "Failed to fetch patient documents" });
    }
  });

  // Delete document
  app.delete("/api/emr/documents/:id", isAuthenticated, hasEmrAccess, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const documentId = parseInt(req.params.id);
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Audit log for document deletion
      await logAudit(req, 'delete', 'document', documentId, document.patientId, {
        fileName: document.fileName,
        documentType: document.documentType
      });
      
      await storage.deleteDocument(documentId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  return httpServer;
}

// Helper function to generate invite codes
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
