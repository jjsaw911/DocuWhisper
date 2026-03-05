import { Router, Request, Response } from "express";
import { mobileApiAuth, requireMobileScope } from "./mobileApiMiddleware";
import { hashApiKey, storage } from "./storage";
import { getTranscriptionProviderStatus, transcribeLocal } from "./sttClient";
import { z } from "zod";
import multer from "multer";
import { openai } from "./openaiClient";
import { timingSafeEqual } from "crypto";
import { authStorage } from "./replit_integrations/auth/storage";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const DEFAULT_MOBILE_SCOPES = [
  "notes:read", "notes:write", "templates:read", "templates:write",
  "tasks:read", "tasks:write", "transcribe", "generate",
  "settings:read", "settings:write",
];
const DEFAULT_MOBILE_AUTH_REDIRECT_ALLOWLIST = ["docuwhisper://auth/callback"];

function getAllowedRedirectUris(): string[] {
  const raw = process.env.MOBILE_AUTH_REDIRECT_ALLOWLIST || "";
  const parsed = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (parsed.length === 0) return DEFAULT_MOBILE_AUTH_REDIRECT_ALLOWLIST;
  return Array.from(new Set([...parsed, ...DEFAULT_MOBILE_AUTH_REDIRECT_ALLOWLIST]));
}

function isRedirectAllowed(uri: string): boolean {
  const allowed = getAllowedRedirectUris();
  return allowed.some(pattern => uri.startsWith(pattern));
}

function getMobileAuthCookieOptions(req: Request) {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = req.secure || forwardedProto === "https";
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? ("none" as const) : ("lax" as const),
    maxAge: 10 * 60 * 1000,
  };
}

function buildMobileAuthCallbackPath(redirectUri: string, state?: string): string {
  const params = new URLSearchParams({ redirect_uri: redirectUri });
  if (state) params.set("state", state);
  return `/api/mobile/auth/callback?${params.toString()}`;
}

function buildReviewLoginPath(redirectUri: string, state?: string, error?: string): string {
  const params = new URLSearchParams({ redirect_uri: redirectUri });
  if (state) params.set("state", state);
  if (error) params.set("error", error);
  return `/api/mobile/auth/review-login?${params.toString()}`;
}

function isMobileReviewLoginEnabled(): boolean {
  return (
    process.env.MOBILE_REVIEW_LOGIN_ENABLED === "true" &&
    !!process.env.MOBILE_REVIEW_USERNAME &&
    !!process.env.MOBILE_REVIEW_PASSWORD
  );
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderReviewLoginPage(params: { redirectUri: string; state?: string; error?: string }): string {
  const escapedRedirect = escapeHtml(params.redirectUri);
  const escapedState = params.state ? escapeHtml(params.state) : "";
  const message =
    params.error === "invalid_credentials"
      ? "Invalid username or password."
      : params.error === "login_failed"
        ? "Sign in failed. Please try again."
        : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DocuWhisper App Review Sign In</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fa; color: #0b1320; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { width: 100%; max-width: 420px; background: #ffffff; border: 1px solid #dce3ea; border-radius: 14px; padding: 22px; box-shadow: 0 12px 30px rgba(17,24,39,0.08); }
    h1 { margin: 0 0 8px; font-size: 1.35rem; }
    p { margin: 0 0 14px; color: #5b6674; font-size: 0.95rem; }
    label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem; }
    input { width: 100%; box-sizing: border-box; border: 1px solid #c8d2dc; border-radius: 10px; padding: 11px; font-size: 0.95rem; margin-bottom: 12px; }
    button { width: 100%; border: 0; border-radius: 10px; padding: 11px; font-size: 0.95rem; font-weight: 700; background: #0d9488; color: #ffffff; cursor: pointer; }
    .error { margin: 0 0 10px; color: #b91c1c; font-size: 0.9rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrap">
    <main class="card">
      <h1>DocuWhisper Review Access</h1>
      <p>Use the App Review credentials provided by DocuWhisper.</p>
      ${message ? `<div class="error">${escapeHtml(message)}</div>` : ""}
      <form method="post" action="/api/mobile/auth/review-login">
        <input type="hidden" name="redirect_uri" value="${escapedRedirect}" />
        <input type="hidden" name="state" value="${escapedState}" />
        <label for="username">Username</label>
        <input id="username" name="username" type="text" autocomplete="username" required />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <button type="submit">Sign In</button>
      </form>
    </main>
  </div>
</body>
</html>`;
}

const parseOptionalInt = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const parseOptionalBool = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return undefined;
};

const deriveNoteTitleFromTranscript = (transcript: string): string => {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled Note";
  const firstSentence = normalized.split(/[.!?]/)[0]?.trim() || normalized;
  if (firstSentence.length <= 72) return firstSentence;
  return `${firstSentence.slice(0, 69).trimEnd()}...`;
};

type SoapSections = {
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
};

const normalizeSoapSection = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const hasAnySoapSection = (sections: SoapSections): boolean => {
  return !!(sections.subjective || sections.objective || sections.assessment || sections.plan);
};

const buildSoapFallbackFromTranscript = (transcript: string): SoapSections => {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return { subjective: null, objective: null, assessment: null, plan: null };
  }
  return {
    subjective: normalized,
    objective: null,
    assessment: null,
    plan: null,
  };
};

const generateSoapSections = async (params: {
  transcript: string;
  userId: string;
  patientName?: string;
  specialty?: string;
  context?: string;
  templateId?: number;
  noDefaultTemplate?: boolean;
  aiInstructions?: string;
  outputLanguage?: string;
}): Promise<SoapSections> => {
  let customPrompt = "";
  let effectiveTemplateId = params.templateId;

  if (!effectiveTemplateId && !params.noDefaultTemplate) {
    effectiveTemplateId = await storage.getDefaultTemplateId(params.userId);
  }

  if (effectiveTemplateId) {
    const template = await storage.getTemplate(effectiveTemplateId);
    if (template?.prompt) {
      customPrompt = template.prompt;
    }
  }

  const languageNames: Record<string, string> = {
    en: "English", es: "Spanish (Español)", fr: "French (Français)",
    de: "German (Deutsch)", pt: "Portuguese (Português)",
  };
  const targetLanguage = languageNames[params.outputLanguage || "en"] || "English";
  const languageInstruction = params.outputLanguage && params.outputLanguage !== "en"
    ? `\nIMPORTANT: Generate all sections in ${targetLanguage}.`
    : "";
  const aiInstructionsSection = params.aiInstructions ? `\nUser instructions:\n${params.aiInstructions}` : "";

  const systemPrompt = `You are a medical documentation assistant creating SOAP notes.
${params.specialty ? `Specialty: ${params.specialty}` : ""}
${params.patientName ? `Patient: ${params.patientName}` : ""}
${params.context ? `Context: ${params.context}` : ""}
${customPrompt ? `Template instructions:\n${customPrompt}` : ""}
${customPrompt ? "IMPORTANT: Follow the template instructions exactly and prioritize them over generic defaults." : ""}
${aiInstructionsSection}
${languageInstruction}

Return valid JSON only:
{"subjective":"...","objective":"...","assessment":"...","plan":"..."}

If a section is unavailable, return an empty string for that section.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Transcript:\n${params.transcript}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);

  const subjective = normalizeSoapSection(parsed.subjective ?? parsed.hpi);
  const objective = normalizeSoapSection(parsed.objective);
  const assessment = normalizeSoapSection(parsed.assessment);
  const plan = normalizeSoapSection(parsed.plan);

  return { subjective, objective, assessment, plan };
};

const classifyTranscriptionError = (error: unknown): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("timeout") || message.includes("abort")) return "timeout";
  if (message.includes("401") || message.includes("403") || message.includes("auth")) return "auth";
  if (message.includes("network") || message.includes("fetch")) return "network";
  return "provider_error";
};

const persistTranscriptionMetric = (payload: Record<string, unknown>) => {
  void storage
    .createTranscriptionMetric({
      userId: parseOptionalText(payload.user_id) ?? null,
      channel: "mobile",
      eventType: parseOptionalText(payload.event) ?? "unknown",
      provider: parseOptionalText(payload.provider) ?? null,
      configuredProvider: parseOptionalText(payload.configured_provider) ?? null,
      fallbackProvider: parseOptionalText(payload.fallback_provider) ?? null,
      chunkId: parseOptionalInt(payload.chunk_id) ?? null,
      sessionId: parseOptionalText(payload.session_id) ?? null,
      fallbackUsed: parseOptionalBool(payload.fallback_used) ?? false,
      retryAttempt: parseOptionalInt(payload.retry_attempt) ?? null,
      maxRetries: parseOptionalInt(payload.max_retries) ?? null,
      errorType: parseOptionalText(payload.error_type) ?? null,
      statusCode: parseOptionalInt(payload.status_code) ?? null,
      latencyMs: parseOptionalInt(payload.latency_ms) ?? null,
      audioBytes: parseOptionalInt(payload.audio_bytes) ?? null,
      transcriptChars: parseOptionalInt(payload.transcript_chars) ?? null,
      language: parseOptionalText(payload.language) ?? null,
      details: JSON.stringify(payload),
    })
    .catch((error) => {
      console.warn("[mobile-transcribe-metric] failed to persist metric:", error);
    });
};

const logTranscriptionMetric = (payload: Record<string, unknown>) => {
  console.log("[mobile-transcribe-metric]", JSON.stringify(payload));
  persistTranscriptionMetric(payload);
};

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
        "GET /auth/start?redirect_uri=<uri>": "Start web-based sign-in (ASWebAuthenticationSession). Redirects through login, then back to redirect_uri with api_key and code params.",
        "GET /auth/review-login?redirect_uri=<uri>": "Optional App Review username/password sign-in page (enabled via MOBILE_REVIEW_LOGIN_ENABLED).",
        "POST /auth/review-login": "Submit App Review username/password credentials (enabled via MOBILE_REVIEW_LOGIN_ENABLED).",
        "GET /auth/callback": "Internal callback after login completes. Auto-generates API key and redirects to app.",
        "POST /auth/exchange": "Compatibility endpoint: exchange code for API key payload.",
      },
      user: {
        "GET /me": "Get user info, settings, and subscription status",
        "DELETE /account": "Delete signed-in account and associated data",
      },
      notes: {
        "GET /notes": "List notes (query: limit, offset)",
        "GET /notes/:id": "Get single note with full SOAP content",
        "POST /notes": "Create note",
        "PATCH /notes/:id": "Update note",
        "DELETE /notes/:id": "Delete note",
      },
      ai: {
        "GET /transcription-provider": "Get active transcription provider for mobile (local/openai)",
        "POST /transcribe": "Transcribe audio (multipart form: audio file). Auto-creates note for non-chunk uploads unless auto_create_note=false.",
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
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const session = (req as any).session as any | undefined;

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

  res.cookie("mobile_auth_redirect", redirectUri, getMobileAuthCookieOptions(req));

  if (!session || typeof session.save !== "function") {
    return res.status(500).json({
      error: "session_unavailable",
      message: "Authentication session is unavailable. Please try again.",
    });
  }

  const callbackPath = buildMobileAuthCallbackPath(redirectUri, state);
  session.returnTo = callbackPath;
  session.mobileAuthRedirect = redirectUri;
  session.mobileAuthState = state;

  const user = req.user as any;
  if (req.isAuthenticated?.() && user?.claims?.sub) {
    return session.save(() => {
      res.redirect(callbackPath);
    });
  }

  session.save(() => {
    if (isMobileReviewLoginEnabled()) {
      return res.redirect(buildReviewLoginPath(redirectUri, state));
    }
    res.redirect(`/api/login`);
  });
});

router.get("/auth/review-login", (req: Request, res: Response) => {
  if (!isMobileReviewLoginEnabled()) {
    return res.status(404).send("Not found");
  }

  const redirectUri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const error = typeof req.query.error === "string" ? req.query.error : undefined;

  if (!redirectUri || !isRedirectAllowed(redirectUri)) {
    return res.status(400).send("Invalid redirect URI");
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(renderReviewLoginPage({ redirectUri, state, error }));
});

router.post("/auth/review-login", async (req: Request, res: Response) => {
  if (!isMobileReviewLoginEnabled()) {
    return res.status(404).send("Not found");
  }

  const redirectUri = typeof req.body?.redirect_uri === "string" ? req.body.redirect_uri : "";
  const state = typeof req.body?.state === "string" ? req.body.state : undefined;
  const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!redirectUri || !isRedirectAllowed(redirectUri)) {
    return res.status(400).send("Invalid redirect URI");
  }

  const expectedUsername = process.env.MOBILE_REVIEW_USERNAME || "";
  const expectedPassword = process.env.MOBILE_REVIEW_PASSWORD || "";

  const usernameValid = username.length > 0 && constantTimeEquals(username, expectedUsername);
  const passwordValid = password.length > 0 && constantTimeEquals(password, expectedPassword);
  if (!usernameValid || !passwordValid) {
    return res.redirect(buildReviewLoginPath(redirectUri, state, "invalid_credentials"));
  }

  const reviewUserId = process.env.MOBILE_REVIEW_USER_ID || "apple-review";
  const reviewUserEmail = process.env.MOBILE_REVIEW_USER_EMAIL || "apple-review@docuwhisper.com";
  const reviewFirstName = process.env.MOBILE_REVIEW_FIRST_NAME || "Apple";
  const reviewLastName = process.env.MOBILE_REVIEW_LAST_NAME || "Reviewer";
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  try {
    await authStorage.upsertUser({
      id: reviewUserId,
      email: reviewUserEmail,
      firstName: reviewFirstName,
      lastName: reviewLastName,
      profileImageUrl: null,
    });

    const userSession = {
      claims: {
        sub: reviewUserId,
        email: reviewUserEmail,
        first_name: reviewFirstName,
        last_name: reviewLastName,
        exp: expiresAt,
      },
      access_token: "app_review",
      refresh_token: undefined,
      expires_at: expiresAt,
    };

    await new Promise<void>((resolve, reject) => {
      (req as any).login(userSession, (error: unknown) => {
        if (error) return reject(error);
        resolve();
      });
    });

    const session = (req as any).session as any | undefined;
    if (!session || typeof session.save !== "function") {
      return res.status(500).send("Authentication session is unavailable");
    }

    res.cookie("mobile_auth_redirect", redirectUri, getMobileAuthCookieOptions(req));
    session.returnTo = buildMobileAuthCallbackPath(redirectUri, state);
    session.mobileAuthRedirect = redirectUri;
    session.mobileAuthState = state;
    return session.save(() => {
      res.redirect(buildMobileAuthCallbackPath(redirectUri, state));
    });
  } catch (error) {
    console.error("[mobile-auth] Review login failed:", error);
    return res.redirect(buildReviewLoginPath(redirectUri, state, "login_failed"));
  }
});

router.get("/auth/callback", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const userId = user?.claims?.sub;
    const userEmail = user?.claims?.email || "";
    const session = (req as any).session as any | undefined;

    const queryRedirect = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : undefined;
    const queryState = typeof req.query.state === "string" ? req.query.state : undefined;
    const cookieRedirect = (req as any).cookies?.mobile_auth_redirect;
    const sessionRedirect = session?.mobileAuthRedirect;
    const sessionState = session?.mobileAuthState;
    const redirectUri = cookieRedirect || sessionRedirect || queryRedirect;
    const state = sessionState || queryState;

    console.log("[mobile-auth] Callback:", {
      authenticated: !!userId,
      hasQueryRedirect: !!queryRedirect,
      hasCookieRedirect: !!cookieRedirect,
      hasSessionRedirect: !!sessionRedirect,
      redirectUri: redirectUri || "(none)",
      sessionId: req.sessionID?.substring(0, 8),
    });

    if (!userId) {
      console.log("[mobile-auth] Callback hit without authenticated user");
      if (redirectUri) {
        const callbackPath = buildMobileAuthCallbackPath(redirectUri, state);
        if (session && typeof session.save === "function") {
          session.returnTo = callbackPath;
          session.mobileAuthRedirect = redirectUri;
          session.mobileAuthState = state;
          return session.save(() => {
            if (isMobileReviewLoginEnabled()) {
              return res.redirect(buildReviewLoginPath(redirectUri, state));
            }
            res.redirect("/api/login");
          });
        }
        if (isMobileReviewLoginEnabled()) {
          return res.redirect(buildReviewLoginPath(redirectUri, state));
        }
        return res.redirect("/api/login");
      }
      return res.status(401).json({ error: "unauthorized", message: "Not authenticated. Start the flow from /api/mobile/auth/start" });
    }

    const cookieOptions = getMobileAuthCookieOptions(req);
    res.clearCookie("mobile_auth_redirect", {
      httpOnly: true,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
    });
    if (session) {
      delete session.mobileAuthRedirect;
      delete session.mobileAuthState;
    }

    if (!redirectUri || !isRedirectAllowed(redirectUri)) {
      console.log("[mobile-auth] No valid redirect URI found, returning 400");
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

    console.log("[mobile-auth] API key generated for user:", userId, "redirecting to app");
    const separator = redirectUri.includes("?") ? "&" : "?";
    const callbackParams = new URLSearchParams({
      api_key: rawKey,
      code: rawKey,
      user_id: userId,
      email: userEmail,
    });
    if (state) callbackParams.set("state", state);
    const callbackUrl = `${redirectUri}${separator}${callbackParams.toString()}`;

    res.redirect(callbackUrl);
  } catch (error: any) {
    console.error("[mobile-auth] Callback error:", error);
    const queryRedirect = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : undefined;
    const session = (req as any).session as any | undefined;
    const redirectUri = (req as any).cookies?.mobile_auth_redirect || session?.mobileAuthRedirect || queryRedirect;
    const cookieOptions = getMobileAuthCookieOptions(req);
    res.clearCookie("mobile_auth_redirect", {
      httpOnly: true,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
    });
    if (redirectUri && isRedirectAllowed(redirectUri)) {
      const separator = redirectUri.includes("?") ? "&" : "?";
      return res.redirect(`${redirectUri}${separator}error=auth_failed&message=${encodeURIComponent("Failed to complete authentication")}`);
    }
    res.status(500).json({ error: "internal_error", message: "Authentication callback failed" });
  }
});

const MobileAuthExchangeSchema = z.object({
  code: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  api_key: z.string().min(1).optional(),
});

router.post("/auth/exchange", async (req: Request, res: Response) => {
  const parsed = MobileAuthExchangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing or invalid auth code",
      details: parsed.error.errors,
    });
  }

  const rawCode = parsed.data.code ?? parsed.data.apiKey ?? parsed.data.api_key;
  if (!rawCode) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing or invalid auth code",
    });
  }

  const code = rawCode.trim();
  if (!code.startsWith("dw_pk_")) {
    return res.status(400).json({
      error: "invalid_code",
      message: "Invalid auth code format",
    });
  }

  const apiKey = await storage.getPersonalApiKeyByHash(hashApiKey(code));
  if (!apiKey || apiKey.status !== "active") {
    return res.status(400).json({
      error: "invalid_code",
      message: "Auth code is invalid or expired",
    });
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return res.status(400).json({
      error: "invalid_code",
      message: "Auth code is invalid or expired",
    });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.json({
    success: true,
    data: {
      apiKey: code,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      api_key: code,
      user_id: apiKey.userId,
      key_name: apiKey.name,
    },
    apiKey: code,
    keyPrefix: apiKey.keyPrefix,
    scopes: apiKey.scopes,
  });
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

router.delete("/account", requireMobileScope("settings:write"), async (req: Request, res: Response) => {
  try {
    const userId = req.mobileUserId!;
    await storage.deleteUserAndData(userId);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Mobile API error:", error);
    res.status(500).json({ error: "internal_error", message: "Failed to delete account" });
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
router.get("/transcription-provider", requireMobileScope("transcribe"), async (_req: Request, res: Response) => {
  const status = getTranscriptionProviderStatus();
  return res.json({
    success: true,
    data: {
      provider: status.provider,
      configuredProvider: status.configuredProvider,
      fallbackProvider: "openai",
      reason: status.reason || null,
    },
  });
});

router.post("/transcribe", requireMobileScope("transcribe"), upload.single("audio"), async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const chunkId = parseOptionalInt(req.body?.chunk_id);
  const sessionId = parseOptionalText(req.body?.session_id);
  const explicitAutoCreate = parseOptionalBool(req.body?.auto_create_note);
  const isChunkedUpload = chunkId !== undefined || !!sessionId;
  const shouldAutoCreateNote = explicitAutoCreate ?? !isChunkedUpload;
  const explicitAutoGenerateSoap = parseOptionalBool(req.body?.auto_generate_soap);
  const shouldAutoGenerateSoap = shouldAutoCreateNote && (explicitAutoGenerateSoap ?? true);
  const providerStatus = getTranscriptionProviderStatus();
  let providerUsed: "local" | "openai" = providerStatus.provider;
  let fallbackUsed = false;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "validation_error", message: "Audio file is required" });
    }

    const file = req.file;
    const language = req.body?.language;

    let transcript: string;
    const transcribeWithOpenAi = async () => {
      const audioFile = new File([file.buffer], file.originalname || "audio.m4a", {
        type: file.mimetype || "audio/m4a",
      });
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "gpt-4o-mini-transcribe",
        response_format: "text",
      });
      return typeof transcription === "string" ? transcription : (transcription as any).text || "";
    };

    logTranscriptionMetric({
      event: "request",
      user_id: req.mobileUserId || null,
      chunk_id: chunkId ?? null,
      provider: providerUsed,
      configured_provider: providerStatus.configuredProvider,
      fallback_used: false,
      language: language || "auto-detect",
      audio_bytes: file.size,
    });

    if (providerStatus.reason) {
      console.warn(`[mobile-transcribe] ${providerStatus.reason}`);
    }

    if (providerUsed === "local") {
      try {
        transcript = await transcribeLocal(file.buffer, language);
      } catch (localError: unknown) {
        fallbackUsed = true;
        const fallbackMessage = localError instanceof Error ? localError.message : String(localError);
        providerUsed = "openai";
        console.warn(`[mobile-transcribe] Local STT failed, falling back to OpenAI: ${fallbackMessage}`);
        logTranscriptionMetric({
          event: "fallback",
          user_id: req.mobileUserId || null,
          chunk_id: chunkId ?? null,
          provider: "local",
          fallback_provider: "openai",
          error_type: classifyTranscriptionError(localError),
        });
        transcript = await transcribeWithOpenAi();
      }
    } else {
      transcript = await transcribeWithOpenAi();
    }

    const latencyMs = Date.now() - startedAt;
    logTranscriptionMetric({
      event: "success",
      user_id: req.mobileUserId || null,
      chunk_id: chunkId ?? null,
      provider: providerUsed,
      fallback_used: fallbackUsed,
      latency_ms: latencyMs,
      transcript_chars: transcript.length,
    });

    let createdNote: any = null;
    let noteAppended = false;
    let noteCreationError: string | null = null;
    let soapGenerationError: string | null = null;
    let soapGenerated = false;

    if (shouldAutoCreateNote) {
      const hasWriteScope = req.personalApiKey?.scopes?.includes("notes:write");
      if (!hasWriteScope) {
        noteCreationError = "API key is missing notes:write scope";
      } else {
        const noteTitle = parseOptionalText(req.body?.note_title) ||
          parseOptionalText(req.body?.title) ||
          deriveNoteTitleFromTranscript(transcript);

        const patientName = parseOptionalText(req.body?.patient_name) || parseOptionalText(req.body?.patientName);
        const specialty = parseOptionalText(req.body?.specialty);
        const patientContext = parseOptionalText(req.body?.patient_context) || parseOptionalText(req.body?.patientContext);
        const templateId = parseOptionalInt(req.body?.template_id) ?? parseOptionalInt(req.body?.templateId);
        const appendToNoteId = parseOptionalInt(req.body?.append_to_note_id) ?? parseOptionalInt(req.body?.appendToNoteId);
        const appendToLatest = parseOptionalBool(req.body?.append_to_latest) ?? parseOptionalBool(req.body?.appendToLatest) ?? false;
        const noDefaultTemplate = parseOptionalBool(req.body?.no_default_template) ?? parseOptionalBool(req.body?.noDefaultTemplate);
        const aiInstructions = parseOptionalText(req.body?.ai_instructions) || parseOptionalText(req.body?.aiInstructions);
        const outputLanguage = parseOptionalText(req.body?.output_language) || parseOptionalText(req.body?.outputLanguage);
        let appendTargetNote: any = null;
        if (appendToNoteId) {
          try {
            const existing = await storage.getNote(appendToNoteId);
            if (existing && existing.userId === req.mobileUserId) {
              appendTargetNote = existing;
            } else {
              noteCreationError = "Append target note not found; creating a new note instead";
            }
          } catch (appendLookupError: unknown) {
            console.error("[mobile-transcribe] append note lookup failed:", appendLookupError);
            noteCreationError = "Unable to append to prior note; creating a new note instead";
          }
        } else if (appendToLatest) {
          try {
            const allNotes = await storage.getNotesByUser(req.mobileUserId!);
            const normalizedPatientName = patientName?.toLowerCase().trim();
            const candidates = normalizedPatientName
              ? allNotes.filter((note) => parseOptionalText(note.patientName)?.toLowerCase() === normalizedPatientName)
              : allNotes;

            const sortedCandidates = candidates.sort((lhs, rhs) => {
              const lhsTs = (lhs.updatedAt ?? lhs.createdAt ?? new Date(0)).getTime();
              const rhsTs = (rhs.updatedAt ?? rhs.createdAt ?? new Date(0)).getTime();
              return rhsTs - lhsTs;
            });

            appendTargetNote = sortedCandidates[0] ?? null;
          } catch (appendLatestError: unknown) {
            console.error("[mobile-transcribe] append latest note lookup failed:", appendLatestError);
          }
        }

        const mergedTranscript = appendTargetNote
          ? [parseOptionalText(appendTargetNote.transcript), transcript].filter(Boolean).join("\n\n").trim()
          : transcript;

        const effectivePatientName = patientName ?? parseOptionalText(appendTargetNote?.patientName);
        const effectiveSpecialty = specialty ?? parseOptionalText(appendTargetNote?.specialty);
        const effectivePatientContext = patientContext ?? parseOptionalText(appendTargetNote?.patientContext);
        const effectiveTemplateId = templateId ?? parseOptionalInt(appendTargetNote?.templateId);

        let soapSections: SoapSections = appendTargetNote ? {
          subjective: parseOptionalText(appendTargetNote.subjective) ?? null,
          objective: parseOptionalText(appendTargetNote.objective) ?? null,
          assessment: parseOptionalText(appendTargetNote.assessment) ?? null,
          plan: parseOptionalText(appendTargetNote.plan) ?? null,
        } : {
          subjective: null,
          objective: null,
          assessment: null,
          plan: null,
        };

        if (shouldAutoGenerateSoap) {
          const hasGenerateScope = req.personalApiKey?.scopes?.includes("generate");
          if (!hasGenerateScope) {
            soapSections = buildSoapFallbackFromTranscript(mergedTranscript);
            soapGenerated = hasAnySoapSection(soapSections);
            soapGenerationError = "API key missing generate scope; used transcript fallback for SOAP";
          } else {
            try {
              soapSections = await generateSoapSections({
                transcript: mergedTranscript,
                userId: req.mobileUserId!,
                patientName: effectivePatientName || undefined,
                specialty: effectiveSpecialty || undefined,
                context: effectivePatientContext || undefined,
                templateId: effectiveTemplateId || undefined,
                noDefaultTemplate: noDefaultTemplate || undefined,
                aiInstructions: aiInstructions || undefined,
                outputLanguage: outputLanguage || undefined,
              });
              soapGenerated = hasAnySoapSection(soapSections);
              if (!soapGenerated) {
                soapSections = buildSoapFallbackFromTranscript(mergedTranscript);
                soapGenerated = hasAnySoapSection(soapSections);
                if (soapGenerated) {
                  soapGenerationError = "AI returned empty SOAP; used transcript fallback";
                }
              }
            } catch (soapError: unknown) {
              const aiErrorMessage = soapError instanceof Error ? soapError.message : String(soapError);
              console.error("[mobile-transcribe] SOAP auto-generate failed:", soapError);
              soapSections = buildSoapFallbackFromTranscript(mergedTranscript);
              soapGenerated = hasAnySoapSection(soapSections);
              soapGenerationError = soapGenerated
                ? `SOAP AI failed; used transcript fallback (${aiErrorMessage})`
                : aiErrorMessage;
            }
          }
        }

        try {
          if (appendTargetNote) {
            createdNote = await storage.updateNote(appendTargetNote.id, {
              transcript: mergedTranscript,
              patientName: effectivePatientName || null,
              specialty: effectiveSpecialty || null,
              subjective: soapSections.subjective,
              objective: soapSections.objective,
              assessment: soapSections.assessment,
              plan: soapSections.plan,
              patientContext: effectivePatientContext || null,
              templateId: effectiveTemplateId ?? null,
            });
            noteAppended = true;
          } else {
            createdNote = await storage.createNote({
              userId: req.mobileUserId!,
              title: noteTitle,
              transcript: mergedTranscript,
              patientName: effectivePatientName || null,
              specialty: effectiveSpecialty || null,
              subjective: soapSections.subjective,
              objective: soapSections.objective,
              assessment: soapSections.assessment,
              plan: soapSections.plan,
              patientContext: effectivePatientContext || null,
              templateId: effectiveTemplateId ?? null,
              icdCodes: null,
            });
          }

          logTranscriptionMetric({
            event: noteAppended ? "note_updated" : "note_created",
            user_id: req.mobileUserId || null,
            chunk_id: chunkId ?? null,
            provider: providerUsed,
            fallback_used: fallbackUsed,
            session_id: sessionId || null,
            details: JSON.stringify({ soap_generated: soapGenerated, note_appended: noteAppended }),
          });
        } catch (noteError: unknown) {
          noteCreationError = noteError instanceof Error ? noteError.message : String(noteError);
          console.error("[mobile-transcribe] note auto-create failed:", noteError);
        }
      }
    }

    res.json({
      success: true,
      data: {
        transcript,
        provider: providerUsed,
        fallback_used: fallbackUsed,
        soap_generated: soapGenerated,
        soap_generation_error: soapGenerationError,
        note_created: !!createdNote,
        note_appended: noteAppended,
        note: createdNote,
        note_creation_error: noteCreationError,
      },
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startedAt;
    const errorType = classifyTranscriptionError(error);
    console.error("Mobile API transcription error:", error);
    logTranscriptionMetric({
      event: "error",
      user_id: req.mobileUserId || null,
      chunk_id: chunkId ?? null,
      provider: providerUsed,
      fallback_used: fallbackUsed,
      error_type: errorType,
      latency_ms: latencyMs,
    });
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
