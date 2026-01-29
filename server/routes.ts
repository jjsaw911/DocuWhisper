import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { transcribeLongAudio } from "./replit_integrations/audio/client";
import { insertNoteSchema, insertTemplateSchema, insertUserSettingsSchema } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";
import multer from "multer";
import { Resend } from "resend";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB limit for long recordings

const generateSoapSchema = z.object({
  transcript: z.string().min(1, "Transcript is required"),
  patientName: z.string().optional(),
  specialty: z.string().optional(),
  templateId: z.number().optional(),
  aiInstructions: z.string().optional(),
  outputLanguage: z.string().optional(), // ISO 639-1 code (en, es, fr, etc.)
});

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  prompt: z.string().min(1, "Template prompt is required"),
  isDefault: z.boolean().optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  prompt: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const updateNoteSchema = z.object({
  title: z.string().optional(),
  patientName: z.string().nullable().optional(),
  subjective: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  assessment: z.string().nullable().optional(),
  plan: z.string().nullable().optional(),
});

const translateNoteSchema = z.object({
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  targetLanguage: z.enum(["en", "es", "fr", "de", "pt"]),
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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
      
      const { transcript, patientName, specialty, templateId, aiInstructions, outputLanguage } = validationResult.data;
      
      console.log("SOAP generation request - transcript length:", transcript.length);
      console.log("SOAP generation request - transcript preview:", transcript.substring(0, 500));
      console.log("SOAP generation request - output language:", outputLanguage || "en");

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

      const basePrompt = customPrompt || `You are a medical documentation assistant. Your task is to extract and organize information from the provided patient consultation transcript into a structured SOAP note.

${specialty ? `Specialty: ${specialty}` : ""}
${patientName ? `Patient: ${patientName}` : ""}

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

  // Create invite code (admin only)
  app.post("/api/admin/invites", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { membershipType, expiresAt } = req.body;
      
      if (!membershipType) {
        return res.status(400).json({ error: "membershipType is required" });
      }

      const validTypes = ["trial_7", "trial_14", "trial_30", "months_1", "months_3", "months_6", "months_12", "lifetime"];
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

      // Calculate membership end date based on type
      const now = new Date();
      let newPeriodEnd: Date;

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
        default:
          return res.status(400).json({ error: "Invalid membership type" });
      }

      // Mark invite as used
      await storage.useInvite(code, userId);

      // Update or create subscription
      await storage.upsertSubscription({
        userId,
        status: "active",
        currentPeriodEnd: newPeriodEnd,
      });

      res.json({ 
        success: true, 
        membershipType: invite.membershipType,
        expiresAt: newPeriodEnd 
      });
    } catch (error) {
      console.error("Error redeeming invite:", error);
      res.status(500).json({ error: "Failed to redeem invite" });
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
