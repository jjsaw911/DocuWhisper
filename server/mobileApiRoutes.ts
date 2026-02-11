import { Router, Request, Response } from "express";
import { mobileApiAuth, requireMobileScope } from "./mobileApiMiddleware";
import { isAuthenticated } from "./replit_integrations/auth";
import { storage } from "./storage";
import { z } from "zod";
import OpenAI from "openai";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const DEFAULT_MOBILE_SCOPES = [
  "notes:read", "notes:write", "templates:read", "templates:write",
  "tasks:read", "tasks:write", "transcribe", "generate",
  "settings:read", "settings:write",
];

function getAllowedRedirectUris(): string[] {
  const raw = process.env.MOBILE_AUTH_REDIRECT_ALLOWLIST || "";
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function isRedirectAllowed(uri: string): boolean {
  const allowed = getAllowedRedirectUris();
  return allowed.some(pattern => uri.startsWith(pattern));
}

// Docs endpoint is public (no auth needed)
router.get("/docs", async (_req: Request, res: Response) => {
  res.json({
    name: "DocuWhisper Mobile API",
    version: "1.0",
    baseUrl: "/api/mobile",
    auth: "Bearer <personal_api_key>",
    keyPrefix: "dw_pk_",
    rateLimit: "30 requests/minute",
    endpoints: {
      auth: {
        "GET /auth/start?redirect_uri=<uri>": "Start web-based sign-in (ASWebAuthenticationSession). Redirects through login, then back to redirect_uri with api_key param.",
        "GET /auth/callback": "Internal callback after login completes. Auto-generates API key and redirects to app.",
      },
      user: { "GET /me": "Get user info, settings, and subscription status" },
      notes: {
        "GET /notes": "List notes (query: limit, offset)",
        "GET /notes/:id": "Get single note with full SOAP content",
        "POST /notes": "Create note",
        "PATCH /notes/:id": "Update note",
        "DELETE /notes/:id": "Delete note",
      },
      ai: {
        "POST /transcribe": "Transcribe audio (multipart form: audio file)",
        "POST /generate-soap": "Generate SOAP note from transcript",
        "POST /generate-title": "Generate title from transcript",
        "POST /generate-codes": "Generate ICD-10/CPT codes from clinical content",
      },
      templates: {
        "GET /templates": "List templates",
        "GET /templates/:id": "Get single template",
      },
      tasks: {
        "GET /tasks": "List tasks",
        "POST /tasks": "Create task",
        "PATCH /tasks/:id": "Update task",
        "POST /tasks/:id/complete": "Mark task complete",
        "DELETE /tasks/:id": "Delete task",
      },
      settings: {
        "GET /settings": "Get user settings",
        "PUT /settings": "Update user settings",
      },
      analytics: { "GET /analytics": "Get usage analytics" },
    },
    scopes: {
      "notes:read": "View notes",
      "notes:write": "Create/edit notes",
      "templates:read": "View templates",
      "templates:write": "Create/edit templates",
      "tasks:read": "View tasks",
      "tasks:write": "Create/edit tasks",
      "transcribe": "Transcribe audio",
      "generate": "Generate SOAP notes and AI content",
      "settings:read": "View settings",
      "settings:write": "Update settings",
    },
  });
});

// ===== MOBILE WEB AUTH (for ASWebAuthenticationSession) =====

router.get("/auth/start", (req: Request, res: Response) => {
  const redirectUri = req.query.redirect_uri as string;

  if (!redirectUri) {
    return res.status(400).json({
      error: "missing_redirect_uri",
      message: "redirect_uri query parameter is required",
    });
  }

  if (!isRedirectAllowed(redirectUri)) {
    return res.status(403).json({
      error: "redirect_not_allowed",
      message: "The provided redirect_uri is not in the allowlist. Set MOBILE_AUTH_REDIRECT_ALLOWLIST env var.",
    });
  }

  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("mobile_auth_redirect", redirectUri, {
    httpOnly: true,
    secure: isProduction,
    maxAge: 10 * 60 * 1000,
    sameSite: "lax",
  });

  (req.session as any).returnTo = "/api/mobile/auth/callback";

  const user = req.user as any;
  if (req.isAuthenticated?.() && user?.claims?.sub) {
    return res.redirect(`/api/mobile/auth/callback`);
  }

  req.session.save(() => {
    res.redirect(`/api/login`);
  });
});

router.get("/auth/callback", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const userId = user?.claims?.sub;
    const userEmail = user?.claims?.email || "";

    if (!userId) {
      return res.status(401).json({ error: "unauthorized", message: "Not authenticated" });
    }

    const redirectUri = (req as any).cookies?.mobile_auth_redirect || (req.session as any).mobileAuthRedirect;
    res.clearCookie("mobile_auth_redirect");
    delete (req.session as any).mobileAuthRedirect;

    if (!redirectUri || !isRedirectAllowed(redirectUri)) {
      return res.status(400).json({
        error: "invalid_session",
        message: "No valid mobile redirect URI in session. Start the flow from /api/mobile/auth/start",
      });
    }

    const existingKeys = await storage.getPersonalApiKeysByUser(userId);
    const mobileKey = existingKeys.find(
      k => k.status === "active" && k.name === "DocuWhisper iOS App"
    );

    let rawKey: string;

    if (mobileKey) {
      await storage.revokePersonalApiKey(mobileKey.id);
      const result = await storage.createPersonalApiKey({
        userId,
        name: "DocuWhisper iOS App",
        scopes: DEFAULT_MOBILE_SCOPES,
      });
      rawKey = result.rawKey;
    } else {
      const activeKeys = existingKeys.filter(k => k.status === "active");
      if (activeKeys.length >= 5) {
        const oldest = activeKeys.sort(
          (a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
        )[0];
        await storage.revokePersonalApiKey(oldest.id);
      }

      const result = await storage.createPersonalApiKey({
        userId,
        name: "DocuWhisper iOS App",
        scopes: DEFAULT_MOBILE_SCOPES,
      });
      rawKey = result.rawKey;
    }

    const separator = redirectUri.includes("?") ? "&" : "?";
    const callbackUrl = `${redirectUri}${separator}api_key=${encodeURIComponent(rawKey)}&user_id=${encodeURIComponent(userId)}&email=${encodeURIComponent(userEmail)}`;

    res.redirect(callbackUrl);
  } catch (error: any) {
    console.error("Mobile auth callback error:", error);
    const redirectUri = (req as any).cookies?.mobile_auth_redirect || (req.session as any).mobileAuthRedirect;
    res.clearCookie("mobile_auth_redirect");
    if (redirectUri && isRedirectAllowed(redirectUri)) {
      const separator = redirectUri.includes("?") ? "&" : "?";
      return res.redirect(`${redirectUri}${separator}error=auth_failed&message=${encodeURIComponent("Failed to complete authentication")}`);
    }
    res.status(500).json({ error: "internal_error", message: "Authentication callback failed" });
  }
});

// All other routes require API key auth
router.use(mobileApiAuth);

// ===== USER INFO =====
router.get("/me", async (req: Request, res: Response) => {
  try {
    const userId = req.mobileUserId!;
    const settings = await storage.getUserSettings(userId);
    const subscription = await storage.getSubscription(userId);
    
    res.json({
      success: true,
      data: {
        userId,
        settings: settings || null,
        subscription: subscription ? {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
        } : null,
      },
    });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch user info" });
  }
});

// ===== NOTES =====
router.get("/notes", requireMobileScope("notes:read"), async (req: Request, res: Response) => {
  try {
    const userId = req.mobileUserId!;
    const allNotes = await storage.getNotesByUser(userId);
    
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const paginated = allNotes.slice(offset, offset + limit);
    
    res.json({
      success: true,
      data: paginated.map(n => ({
        id: n.id,
        title: n.title,
        patientName: n.patientName,
        specialty: n.specialty,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
      pagination: { total: allNotes.length, limit, offset, hasMore: offset + limit < allNotes.length },
    });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch notes" });
  }
});

router.get("/notes/:id", requireMobileScope("notes:read"), async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(req.params.id as string);
    if (isNaN(noteId)) return res.status(400).json({ error: "validation_error", message: "Invalid note ID" });
    
    const note = await storage.getNote(noteId);
    if (!note || note.userId !== req.mobileUserId) {
      return res.status(404).json({ error: "not_found", message: "Note not found" });
    }
    
    res.json({ success: true, data: note });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch note" });
  }
});

const CreateNoteSchema = z.object({
  title: z.string().min(1),
  patientName: z.string().optional(),
  specialty: z.string().optional(),
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  transcript: z.string().optional(),
  patientContext: z.string().optional(),
  templateId: z.number().optional(),
  icdCodes: z.string().optional(),
});

router.post("/notes", requireMobileScope("notes:write"), async (req: Request, res: Response) => {
  try {
    const data = CreateNoteSchema.parse(req.body);
    const note = await storage.createNote({
      ...data,
      userId: req.mobileUserId!,
      patientName: data.patientName || null,
      specialty: data.specialty || null,
      subjective: data.subjective || null,
      objective: data.objective || null,
      assessment: data.assessment || null,
      plan: data.plan || null,
      transcript: data.transcript || null,
      patientContext: data.patientContext || null,
      templateId: data.templateId || null,
      icdCodes: data.icdCodes || null,
    });
    
    res.status(201).json({ success: true, data: note });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_error", details: error.errors });
    }
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to create note" });
  }
});

const UpdateNoteSchema = z.object({
  title: z.string().optional(),
  patientName: z.string().nullable().optional(),
  subjective: z.string().nullable().optional(),
  objective: z.string().nullable().optional(),
  assessment: z.string().nullable().optional(),
  plan: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  patientContext: z.string().nullable().optional(),
  templateId: z.number().nullable().optional(),
  icdCodes: z.string().nullable().optional(),
});

router.patch("/notes/:id", requireMobileScope("notes:write"), async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(req.params.id as string);
    if (isNaN(noteId)) return res.status(400).json({ error: "validation_error", message: "Invalid note ID" });
    
    const existing = await storage.getNote(noteId);
    if (!existing || existing.userId !== req.mobileUserId) {
      return res.status(404).json({ error: "not_found", message: "Note not found" });
    }
    
    const data = UpdateNoteSchema.parse(req.body);
    const updated = await storage.updateNote(noteId, data);
    
    res.json({ success: true, data: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_error", details: error.errors });
    }
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to update note" });
  }
});

router.delete("/notes/:id", requireMobileScope("notes:write"), async (req: Request, res: Response) => {
  try {
    const noteId = parseInt(req.params.id as string);
    if (isNaN(noteId)) return res.status(400).json({ error: "validation_error", message: "Invalid note ID" });
    
    const existing = await storage.getNote(noteId);
    if (!existing || existing.userId !== req.mobileUserId) {
      return res.status(404).json({ error: "not_found", message: "Note not found" });
    }
    
    await storage.deleteNote(noteId);
    res.json({ success: true, message: "Note deleted" });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to delete note" });
  }
});

// ===== TRANSCRIPTION =====
router.post("/transcribe", requireMobileScope("transcribe"), upload.single("audio"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "validation_error", message: "Audio file is required" });
    }

    const openai = new OpenAI();
    const audioFile = new File([req.file.buffer], req.file.originalname || "audio.m4a", {
      type: req.file.mimetype || "audio/m4a",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
      response_format: "text",
    });

    res.json({ success: true, data: { transcript: transcription } });
  } catch (error: any) {
    console.error("Mobile API transcription error:", error);
    res.status(500).json({ error: "internal_error", message: "Transcription failed" });
  }
});

// ===== SOAP GENERATION =====
const GenerateSoapSchema = z.object({
  transcript: z.string().min(1),
  patientName: z.string().optional(),
  specialty: z.string().optional(),
  templateId: z.number().optional(),
  aiInstructions: z.string().optional(),
  outputLanguage: z.string().optional(),
  context: z.string().optional(),
  noDefaultTemplate: z.boolean().optional(),
});

router.post("/generate-soap", requireMobileScope("generate"), async (req: Request, res: Response) => {
  try {
    const data = GenerateSoapSchema.parse(req.body);
    const userId = req.mobileUserId!;
    
    let customPrompt = "";
    let effectiveTemplateId = data.templateId;
    
    if (!effectiveTemplateId && !data.noDefaultTemplate) {
      effectiveTemplateId = await storage.getDefaultTemplateId(userId);
    }
    
    if (effectiveTemplateId) {
      const template = await storage.getTemplate(effectiveTemplateId);
      if (template) {
        customPrompt = template.prompt;
      }
    }

    const languageNames: Record<string, string> = {
      en: "English", es: "Spanish (Español)", fr: "French (Français)",
      de: "German (Deutsch)", pt: "Portuguese (Português)",
    };
    const targetLanguage = languageNames[data.outputLanguage || "en"] || "English";
    const languageInstruction = data.outputLanguage && data.outputLanguage !== "en" 
      ? `\n\nIMPORTANT: Generate ALL content in ${targetLanguage}.`
      : "";

    const contextSection = data.context ? `\nPATIENT BACKGROUND & CONTEXT:\n${data.context}\n` : "";
    const aiInstructionsSection = data.aiInstructions ? `\n\nIMPORTANT - User Instructions:\n${data.aiInstructions}` : "";

    let systemPrompt: string;
    
    if (customPrompt) {
      const isHpiFormat = customPrompt.toLowerCase().includes('hpi') && 
                         (customPrompt.toLowerCase().includes('section 1. hpi') || 
                          customPrompt.toLowerCase().includes('required structure') ||
                          customPrompt.toLowerCase().includes('hpi must appear'));
      
      if (isHpiFormat) {
        systemPrompt = `You are a medical documentation assistant generating clinical notes in HPI + Plan format.
${data.specialty ? `Specialty: ${data.specialty}` : ""}
${data.patientName ? `Patient: ${data.patientName}` : ""}
${contextSection}
TEMPLATE INSTRUCTIONS:
${customPrompt}
${aiInstructionsSection}${languageInstruction}

Return valid JSON: {"hpi": "...", "plan": "..."}`;
      } else {
        systemPrompt = `You are a medical documentation assistant.
${data.specialty ? `Specialty: ${data.specialty}` : ""}
${data.patientName ? `Patient: ${data.patientName}` : ""}
${contextSection}
TEMPLATE INSTRUCTIONS:
${customPrompt}
${aiInstructionsSection}${languageInstruction}

Return valid JSON: {"subjective": "...", "objective": "...", "assessment": "...", "plan": "..."}`;
      }
    } else {
      systemPrompt = `You are a medical documentation assistant creating SOAP notes.
${data.specialty ? `Specialty: ${data.specialty}` : ""}
${data.patientName ? `Patient: ${data.patientName}` : ""}
${contextSection}${aiInstructionsSection}${languageInstruction}

Return valid JSON: {"subjective": "...", "objective": "...", "assessment": "...", "plan": "..."}`;
    }

    const openai = new OpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Transcript:\n${data.transcript}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return res.status(500).json({ error: "ai_error", message: "No response from AI" });
    }

    const soapNote = JSON.parse(content);
    res.json({ success: true, data: soapNote });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_error", details: error.errors });
    }
    console.error("Mobile API SOAP generation error:", error);
    res.status(500).json({ error: "internal_error", message: "SOAP generation failed" });
  }
});

// ===== GENERATE TITLE =====
router.post("/generate-title", requireMobileScope("generate"), async (req: Request, res: Response) => {
  try {
    const { transcript } = z.object({ transcript: z.string().min(1) }).parse(req.body);
    
    const openai = new OpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: 'Generate a brief clinical note title (3-6 words) from the transcript. Return JSON: {"title": "..."}' },
        { role: "user", content: transcript.substring(0, 2000) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
    res.json({ success: true, data: { title: result.title || "New Note" } });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_error", details: error.errors });
    }
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Title generation failed" });
  }
});

// ===== ICD-10 / CPT CODES =====
router.post("/generate-codes", requireMobileScope("generate"), async (req: Request, res: Response) => {
  try {
    const data = z.object({
      subjective: z.string().optional(),
      objective: z.string().optional(),
      assessment: z.string().optional(),
      plan: z.string().optional(),
      hpi: z.string().optional(),
    }).parse(req.body);

    const clinicalContent = [
      data.subjective && `Subjective: ${data.subjective}`,
      data.objective && `Objective: ${data.objective}`,
      data.assessment && `Assessment: ${data.assessment}`,
      data.plan && `Plan: ${data.plan}`,
      data.hpi && `HPI: ${data.hpi}`,
    ].filter(Boolean).join("\n\n");

    if (!clinicalContent) {
      return res.status(400).json({ error: "validation_error", message: "At least one clinical section required" });
    }

    const openai = new OpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: `Analyze the clinical documentation and suggest ICD-10 and CPT codes. Return JSON:
{"codes": [{"code": "ICD-10 code", "description": "...", "confidence": 0.0-1.0}], "cptCodes": [{"code": "CPT code", "description": "...", "confidence": 0.0-1.0}]}` },
        { role: "user", content: clinicalContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || "{}");
    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_error", details: error.errors });
    }
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Code generation failed" });
  }
});

// ===== TEMPLATES =====
router.get("/templates", requireMobileScope("templates:read"), async (req: Request, res: Response) => {
  try {
    const templates = await storage.getTemplatesByUser(req.mobileUserId!);
    res.json({ success: true, data: templates });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch templates" });
  }
});

router.get("/templates/:id", requireMobileScope("templates:read"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "validation_error", message: "Invalid template ID" });
    
    const template = await storage.getTemplate(id);
    if (!template || template.userId !== req.mobileUserId) {
      return res.status(404).json({ error: "not_found", message: "Template not found" });
    }
    
    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch template" });
  }
});

// ===== TASKS =====
router.get("/tasks", requireMobileScope("tasks:read"), async (req: Request, res: Response) => {
  try {
    const tasks = await storage.getTasksByUser(req.mobileUserId!);
    res.json({ success: true, data: tasks });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch tasks" });
  }
});

const CreateTaskSchema = z.object({
  title: z.string().min(1),
  noteId: z.number().optional(),
  patientName: z.string().optional(),
  category: z.enum(["document", "order", "coordinate", "communicate"]).optional(),
  dueDate: z.string().optional(),
});

router.post("/tasks", requireMobileScope("tasks:write"), async (req: Request, res: Response) => {
  try {
    const data = CreateTaskSchema.parse(req.body);
    const task = await storage.createTask({
      userId: req.mobileUserId!,
      title: data.title,
      noteId: data.noteId || null,
      patientName: data.patientName || null,
      category: data.category || "document",
      status: "todo",
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    });
    
    res.status(201).json({ success: true, data: task });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "validation_error", details: error.errors });
    }
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to create task" });
  }
});

router.patch("/tasks/:id", requireMobileScope("tasks:write"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "validation_error", message: "Invalid task ID" });
    
    const existing = await storage.getTask(id);
    if (!existing || existing.userId !== req.mobileUserId) {
      return res.status(404).json({ error: "not_found", message: "Task not found" });
    }
    
    const updated = await storage.updateTask(id, req.body);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to update task" });
  }
});

router.post("/tasks/:id/complete", requireMobileScope("tasks:write"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "validation_error", message: "Invalid task ID" });
    
    const existing = await storage.getTask(id);
    if (!existing || existing.userId !== req.mobileUserId) {
      return res.status(404).json({ error: "not_found", message: "Task not found" });
    }
    
    const completed = await storage.completeTask(id);
    res.json({ success: true, data: completed });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to complete task" });
  }
});

router.delete("/tasks/:id", requireMobileScope("tasks:write"), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) return res.status(400).json({ error: "validation_error", message: "Invalid task ID" });
    
    const existing = await storage.getTask(id);
    if (!existing || existing.userId !== req.mobileUserId) {
      return res.status(404).json({ error: "not_found", message: "Task not found" });
    }
    
    await storage.deleteTask(id);
    res.json({ success: true, message: "Task deleted" });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to delete task" });
  }
});

// ===== SETTINGS =====
router.get("/settings", requireMobileScope("settings:read"), async (req: Request, res: Response) => {
  try {
    const settings = await storage.getUserSettings(req.mobileUserId!);
    res.json({ success: true, data: settings || null });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch settings" });
  }
});

router.put("/settings", requireMobileScope("settings:write"), async (req: Request, res: Response) => {
  try {
    const settings = await storage.upsertUserSettings({
      ...req.body,
      userId: req.mobileUserId!,
    });
    res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to update settings" });
  }
});

// ===== ANALYTICS =====
router.get("/analytics", requireMobileScope("notes:read"), async (req: Request, res: Response) => {
  try {
    const analytics = await storage.getAnalytics(req.mobileUserId!);
    res.json({ success: true, data: analytics });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch analytics" });
  }
});

export default router;
