import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import type Stripe from "stripe";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import {
  getSubscriptionAccessState,
  hasSubscriptionAccess,
  normalizeExpiredSubscriptionStatus,
} from "./subscriptionAccess";
import { getAdminAccessContext, resolveAdminAccess } from "./adminAccess";
import { getNoteCreditEntitlement, getEffectiveSubscriptionPlan, isOwnerEmail } from "./subscriptionPlans";
import { transcribeLongAudio } from "./replit_integrations/audio/client";
import { getTranscriptionProviderStatus, transcribeLocal } from "./sttClient";
import {
  buildMedicalVocabularyPrompt,
  getGlobalMedicalVocabulary,
  updateGlobalMedicalVocabulary,
} from "./medicalVocabulary";
import {
  getAiProviderPreference,
  initializeAiProviderPreference,
  updateAiProviderPreference,
} from "./aiProviderPreference";
import {
  ADMIN_AI_TEXT_MODELS,
  estimateModelCostUsd,
  getAdminAiTextModel,
  getAiGenerationSettings,
  initializeAiGenerationSettings,
  updateAiGenerationSettings,
  type AdminAiTextModel,
} from "./aiGenerationSettings";
import {
  clearSavedPersonalAiKey,
  getSavedPersonalAiKeyStatus,
  initializeSavedPersonalAiKey,
  savePersonalAiKey,
} from "./aiCredentialStore";
import { getRoomInfo } from "./websocket";
import {
  generateClinicalNoteFromTranscript,
  generateClinicalTitleFromTranscript,
} from "./clinicalNotePipeline";
import { fetchOpenAiCostSummary } from "./openaiCostMonitor";
import {
  downloadSupportMailboxAttachment,
  getSupportMailboxConversation,
  getSupportMailboxMessage,
  getSupportMailboxStatus,
  getSupportMailboxUnreadCount,
  listSupportMailboxMessages,
  moveSupportMailboxMessage,
  sendSupportMailboxMessage,
  type SupportMailboxFolder,
} from "./supportMailbox";
import {
  getMailboxDirectoryPreference,
  getMailboxDirectoryVisibilityMap,
  updateMailboxDirectoryPreference,
} from "./mailboxDirectory";
import { getApiUsageSummary } from "./apiUsageMonitor";
import {
  insertNoteSchema,
  insertTemplateSchema,
  insertUserSettingsSchema,
  insertPatientSchema,
  insertAppointmentSchema,
  insertPatientDocumentSchema,
  API_KEY_SCOPES,
  type AuditLog,
  type Note as BillingNote,
  type Subscription as BillingSubscription,
} from "@shared/schema";
import {
  DEFAULT_SUBSCRIPTION_PLAN_CODE,
  SUBSCRIPTION_PLANS,
  getSubscriptionPlanDefinition,
  type BillingInterval,
  type SubscriptionPlanCode,
} from "@shared/subscriptionPlans";
import { z } from "zod";
import { getPersonalKeySource, openai, type AiProviderSource } from "./openaiClient";
import multer from "multer";
import { Resend } from "resend";
import externalApiRoutes from "./externalApiRoutes";
import mobileApiRoutes from "./mobileApiRoutes";
import fhirRoutes from "./fhirRoutes";
import { PERSONAL_API_SCOPES } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB limit for long recordings
const shouldLogVerboseAiDetails =
  process.env.NODE_ENV !== "production" || process.env.VERBOSE_AI_LOGS === "true";

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function readAnyEnv(...names: string[]): string {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return "";
}

const DEFAULT_APPLE_TEAM_ID = "7D7S5WFB32";
const DEFAULT_IOS_APP_BUNDLE_ID = "com.jjsaw911.docuwhispermobile";
const DEFAULT_APPLE_ASSOCIATED_DOMAIN_PATHS = [
  "/api/mobile/auth/*",
  "/api/login",
  "/api/login/*",
];

type AppleAppSiteAssociationPayload = {
  applinks: {
    apps: string[];
    details: Array<{
      appIDs: string[];
      paths: string[];
    }>;
  };
  webcredentials: {
    apps: string[];
  };
};

function parseCommaSeparatedEnv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getAppleAssociatedDomainAppIds(): string[] {
  const explicitAppIds = parseCommaSeparatedEnv(readEnv("APPLE_ASSOCIATED_DOMAIN_APP_IDS"));
  if (explicitAppIds.length > 0) {
    return Array.from(new Set(explicitAppIds));
  }

  const teamId = readAnyEnv("APPLE_TEAM_ID") || DEFAULT_APPLE_TEAM_ID;
  const bundleId =
    readAnyEnv("IOS_APP_BUNDLE_ID", "APPLE_BUNDLE_ID") || DEFAULT_IOS_APP_BUNDLE_ID;

  if (!teamId || !bundleId) {
    return [];
  }

  return [`${teamId}.${bundleId}`];
}

function getAppleAssociatedDomainPaths(): string[] {
  const explicitPaths = parseCommaSeparatedEnv(readEnv("APPLE_ASSOCIATED_DOMAIN_PATHS"));
  if (explicitPaths.length > 0) {
    return Array.from(new Set(explicitPaths));
  }
  return DEFAULT_APPLE_ASSOCIATED_DOMAIN_PATHS;
}

function buildAppleAppSiteAssociationPayload(): AppleAppSiteAssociationPayload | null {
  const appIds = getAppleAssociatedDomainAppIds();
  if (appIds.length === 0) {
    return null;
  }

  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: appIds,
          paths: getAppleAssociatedDomainPaths(),
        },
      ],
    },
    webcredentials: {
      apps: appIds,
    },
  };
}

function logVerboseAiDetails(...args: unknown[]) {
  if (shouldLogVerboseAiDetails) {
    console.log(...args);
  }
}

function logVerboseAiErrorDetails(...args: unknown[]) {
  if (shouldLogVerboseAiDetails) {
    console.error(...args);
  }
}

function canExposeSoapDebug(req: Request & { user?: { claims?: { email?: string } } }): boolean {
  const email = req.user?.claims?.email?.trim().toLowerCase() || "";
  const host = req.hostname?.trim().toLowerCase() || "";
  return (
    email === "joseph.sawyer@outlook.com" &&
    (host === "beta.docuwhisper.com" || host === "localhost" || host === "127.0.0.1")
  );
}

type StripeClient = Awaited<ReturnType<typeof getUncachableStripeClient>>;

type StripePriceSummary = {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring?: { interval: BillingInterval } | null;
  productName: string | null;
};

const STRIPE_PRICE_ENV_BY_PLAN_AND_INTERVAL: Record<
  SubscriptionPlanCode,
  Record<BillingInterval, string>
> = {
  starter: {
    month: "STRIPE_PRICE_ID_STARTER",
    year: "STRIPE_PRICE_ID_STARTER_ANNUAL",
  },
  standard: {
    month: "STRIPE_PRICE_ID_STANDARD",
    year: "STRIPE_PRICE_ID_STANDARD_ANNUAL",
  },
  pro: {
    month: "STRIPE_PRICE_ID_PRO",
    year: "STRIPE_PRICE_ID_PRO_ANNUAL",
  },
  unlimited: {
    month: "STRIPE_PRICE_ID_UNLIMITED",
    year: "STRIPE_PRICE_ID_UNLIMITED_ANNUAL",
  },
};

async function retrieveConfiguredSubscriptionPrice(
  stripe: StripeClient,
  configuredPriceId: string,
  billingInterval: BillingInterval,
) {
  const price = await stripe.prices.retrieve(configuredPriceId, {
    expand: ["product"],
  });

  if (!price.active) {
    throw new Error(`Configured Stripe price ${configuredPriceId} is inactive.`);
  }

  if (price.type !== "recurring" || price.recurring?.interval !== billingInterval) {
    throw new Error(
      `Configured Stripe price ${configuredPriceId} must be an active ${billingInterval === "year" ? "yearly" : "monthly"} recurring price.`,
    );
  }

  return price;
}

function isBillingInterval(value: string | null | undefined): value is BillingInterval {
  return value === "month" || value === "year";
}

function toStripePriceSummary(price: Stripe.Price): StripePriceSummary {
  const interval = isBillingInterval(price.recurring?.interval) ? price.recurring.interval : null;
  return {
    id: price.id,
    unit_amount: price.unit_amount,
    currency: price.currency,
    recurring: interval ? { interval } : null,
    productName:
      price.product && typeof price.product !== "string" && "name" in price.product
        ? typeof price.product.name === "string"
          ? price.product.name
          : null
        : null,
  };
}

async function resolveSubscriptionPriceForPlan(
  stripe: StripeClient,
  planCode: SubscriptionPlanCode,
  billingInterval: BillingInterval = "month",
) {
  const configuredPriceId =
    readEnv(STRIPE_PRICE_ENV_BY_PLAN_AND_INTERVAL[planCode][billingInterval]) ||
    (planCode === DEFAULT_SUBSCRIPTION_PLAN_CODE
      ? readAnyEnv(
          billingInterval === "month" ? "STRIPE_PRICE_ID" : "STRIPE_PRICE_ID_ANNUAL",
        )
      : "");

  if (configuredPriceId) {
    return retrieveConfiguredSubscriptionPrice(stripe, configuredPriceId, billingInterval);
  }

  if (planCode !== DEFAULT_SUBSCRIPTION_PLAN_CODE || billingInterval !== "month") {
    return null;
  }

  const prices = await stripe.prices.list({
    active: true,
    limit: 100,
    recurring: { interval: "month" },
    expand: ["data.product"],
  });

  if (prices.data.length === 0) {
    return null;
  }

  if (prices.data.length > 1) {
    throw new Error("Multiple active monthly Stripe prices found. Set STRIPE_PRICE_ID for DocuWhisper.");
  }

  return prices.data[0];
}

async function resolveConfiguredSubscriptionPrices(stripe: StripeClient) {
  const prices = await Promise.all(
    SUBSCRIPTION_PLANS.map(async (plan) => {
      const [monthlyPrice, annualPrice] = await Promise.all([
        resolveSubscriptionPriceForPlan(stripe, plan.code, "month"),
        resolveSubscriptionPriceForPlan(stripe, plan.code, "year"),
      ]);

      const priceByInterval = Object.fromEntries(
        [
          monthlyPrice ? (["month", toStripePriceSummary(monthlyPrice)] as const) : null,
          annualPrice ? (["year", toStripePriceSummary(annualPrice)] as const) : null,
        ].filter((entry): entry is [BillingInterval, StripePriceSummary] => entry !== null),
      );

      return Object.keys(priceByInterval).length > 0 ? [plan.code, priceByInterval] : null;
    }),
  );

  return Object.fromEntries(
    prices.filter(
      (entry): entry is [SubscriptionPlanCode, Partial<Record<BillingInterval, StripePriceSummary>>] =>
        entry !== null,
    ),
  );
}

async function getStripeSubscriptionBillingInterval(
  stripe: StripeClient,
  stripeSubscriptionId: string,
): Promise<BillingInterval | null> {
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ["items.data.price"],
  });
  const interval = subscription.items.data[0]?.price?.recurring?.interval;
  return isBillingInterval(interval) ? interval : null;
}

const speakerSegmentSchema = z.object({
  speaker: z.enum(["clinician", "patient"]),
  text: z.string(),
  chunk_id: z.number(),
  timestamp: z.number(),
});

const generateSoapSchema = z.object({
  transcript: z.string().min(1, "Transcript is required"),
  patientName: z.string().optional(),
  specialty: z.string().optional(),
  templateId: z.number().optional(),
  aiInstructions: z.string().optional(),
  outputLanguage: z.string().optional(),
  context: z.string().optional(),
  noDefaultTemplate: z.boolean().optional(),
  speakerSegments: z.array(speakerSegmentSchema).optional(),
  noteId: z.number().int().positive().optional(),
  enforceNoteCredit: z.boolean().optional(),
  noteStyle: z.enum(["detailed", "concise", "bullet_points"]).optional(),
});

async function getUserNoteCreditState(params: {
  userId: string;
  userEmail?: string | null;
  existingNote?: Pick<BillingNote, "creditConsumedAt"> | null;
}) {
  let subscription = await storage.getSubscription(params.userId);
  subscription = await normalizeExpiredSubscriptionStatus(params.userId, subscription);
  const usage = await storage.getNoteCreditUsageSummary(params.userId);
  const adminAccess = await resolveAdminAccess({
    userId: params.userId,
    userEmail: params.userEmail,
  });

  return getNoteCreditEntitlement({
    subscription,
    usage,
    isAdmin: adminAccess.isAdmin,
    isSuperAdmin: adminAccess.isSuperAdmin,
    noteAlreadyConsumed: Boolean(params.existingNote?.creditConsumedAt),
  });
}

function createNoteCreditExceededPayload(
  entitlement: Awaited<ReturnType<typeof getUserNoteCreditState>>,
) {
  return {
    error: "payment_required",
    code: "note_credits_exhausted",
    message:
      entitlement.reason === "inactive"
        ? "An active subscription is required before you can save new AI notes."
        : `Your ${entitlement.plan.name.toLowerCase()} plan has no note credits remaining for this cycle.`,
    plan: {
      code: entitlement.plan.code,
      name: entitlement.plan.name,
      monthlyNoteAllowance: entitlement.plan.monthlyNoteAllowance,
      unlimited: entitlement.plan.unlimited,
      source: entitlement.plan.source,
    },
    usage: {
      currentPeriodCount: entitlement.usage.currentPeriodCount,
      includedCredits: entitlement.usage.includedCredits,
      remainingCredits: entitlement.usage.remainingCredits,
      exhausted: entitlement.usage.exhausted,
      currentPeriodStart: entitlement.usage.currentPeriodStart,
      nextResetAt: entitlement.usage.nextResetAt,
    },
  };
}

function buildStoredNoteSections(soapNote: Record<string, unknown>) {
  const hpi = typeof soapNote.hpi === "string" ? soapNote.hpi : "";
  const plan = typeof soapNote.plan === "string" ? soapNote.plan : "";

  if (hpi) {
    return {
      subjective: hpi,
      objective: "",
      assessment: "",
      plan,
    };
  }

  return {
    subjective: typeof soapNote.subjective === "string" ? soapNote.subjective : "",
    objective: typeof soapNote.objective === "string" ? soapNote.objective : "",
    assessment: typeof soapNote.assessment === "string" ? soapNote.assessment : "",
    plan,
  };
}

function hasMeaningfulStructuredContent(
  payload: Record<string, unknown>,
  requiredFields: string[],
): boolean {
  return requiredFields.some((field) => {
    const value = payload[field];
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (value && typeof value === "object") {
      return Object.keys(value).length > 0;
    }
    return false;
  });
}

async function createJsonCompletionWithRetry(params: {
  label: string;
  model: string;
  fallbackModel?: string;
  systemPrompt: string;
  userContent: string;
  requiredFields: string[];
  maxCompletionTokens: number;
}) {
  let lastContent = "{}";
  const attempts = [params.model, params.model];
  if (params.fallbackModel && params.fallbackModel !== params.model) {
    attempts.push(params.fallbackModel);
  }

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    const attempt = attemptIndex + 1;
    const attemptModel = attempts[attemptIndex];
    const retryInstruction =
      attemptIndex === 0
        ? ""
        : `\n\nRETRY REQUIREMENT: Your previous response was empty or missing the required fields. Return a valid JSON object with non-empty ${params.requiredFields.join(", ")} values derived from the transcript. If a field truly has no supporting detail, explicitly write "No information documented for this section." instead of leaving it blank. Return JSON only.`;

    const response = await openai.chat.completions.create({
      model: attemptModel,
      messages: [
        { role: "system", content: `${params.systemPrompt}${retryInstruction}` },
        { role: "user", content: params.userContent },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: params.maxCompletionTokens,
    });

    const content = response.choices[0]?.message?.content || "{}";
    lastContent = content;

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (
        params.requiredFields.length === 0 ||
        hasMeaningfulStructuredContent(parsed, params.requiredFields)
      ) {
        return { content, parsed, attempts: attempt, model: attemptModel };
      }

      console.warn(
        `[${params.label}] Empty structured response on attempt ${attempt} using ${attemptModel}; retrying.`,
        parsed,
      );
    } catch (error) {
      console.warn(
        `[${params.label}] Invalid JSON response on attempt ${attempt} using ${attemptModel}; retrying.`,
        error,
      );
      if (attemptIndex === attempts.length - 1) {
        throw error;
      }
    }
  }

  throw new Error(`${params.label} returned empty structured content after retry. Last content: ${lastContent}`);
}

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
  patientInstructions: z.string().nullable().optional(),
  patientId: z.number().nullable().optional(),
  templateId: z.number().nullable().optional(),
  icdCodes: z.string().nullable().optional(),
  createdAt: z
    .string()
    .datetime()
    .optional()
    .transform((value) => (value ? new Date(value) : undefined)),
});

const regenerateNoteFromTranscriptSchema = z.object({
  transcript: z.string().min(1, "Transcript is required"),
  patientName: z.string().nullable().optional(),
  specialty: z.string().optional(),
  templateId: z.number().optional(),
  outputLanguage: z.string().optional(),
  context: z.string().nullable().optional(),
  noDefaultTemplate: z.boolean().optional(),
  speakerSegments: z.array(speakerSegmentSchema).optional(),
  icdCodes: z.string().nullable().optional(),
  consumeNoteCredit: z.boolean().optional(),
  noteStyle: z.enum(["detailed", "concise", "bullet_points"]).optional(),
});

const updateMedicalVocabularySchema = z.object({
  customTerms: z.array(z.string()).max(1500),
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

const hasAdminFeatureAccess = async (req: any): Promise<boolean> =>
  (await getAdminAccessContext(req)).isAdmin;

const hasSuperAdminFeatureAccess = async (req: any): Promise<boolean> =>
  (await getAdminAccessContext(req)).isSuperAdmin;

// EMR access middleware - only admin users can access EMR functions
const hasEmrAccess = async (req: any, res: Response, next: Function) => {
  try {
    const userId = req.user?.claims?.sub;
    
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    if (await hasAdminFeatureAccess(req)) {
      req.isVendorOwner = true; // Flag for routes to know this is vendor access
      return next();
    }

    return res.status(403).json({
      error: "Admin access required for EMR features.",
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

type MailboxFolder = "inbox" | "sent";

type MailboxLogDetails = {
  recipientUserId: string;
  recipientEmail: string | null;
  recipientDisplayName: string | null;
  subject: string;
  message: string;
  readAt: string | null;
  readByUserId: string | null;
  deletedBySenderAt: string | null;
  deletedByRecipientAt: string | null;
};

type InternalMessageLogDetails = {
  subject: string;
  message: string;
  category: string;
  readAt: string | null;
  readByAdminId: string | null;
  deletedAt: string | null;
  deletedByAdminId: string | null;
};

function parseLogDetails(details: string | null | undefined): Record<string, unknown> {
  if (!details) return {};
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseMailboxLogDetails(log: AuditLog): MailboxLogDetails {
  const parsed = parseLogDetails(log.details);
  return {
    recipientUserId: typeof parsed.recipientUserId === "string" ? parsed.recipientUserId : "",
    recipientEmail: typeof parsed.recipientEmail === "string" ? parsed.recipientEmail : null,
    recipientDisplayName: typeof parsed.recipientDisplayName === "string" ? parsed.recipientDisplayName : null,
    subject: typeof parsed.subject === "string" ? parsed.subject : "No subject",
    message: typeof parsed.message === "string" ? parsed.message : "",
    readAt: typeof parsed.readAt === "string" ? parsed.readAt : null,
    readByUserId: typeof parsed.readByUserId === "string" ? parsed.readByUserId : null,
    deletedBySenderAt: typeof parsed.deletedBySenderAt === "string" ? parsed.deletedBySenderAt : null,
    deletedByRecipientAt: typeof parsed.deletedByRecipientAt === "string" ? parsed.deletedByRecipientAt : null,
  };
}

function serializeMailboxLogDetails(details: MailboxLogDetails): string {
  return JSON.stringify(details);
}

function parseInternalMessageLogDetails(log: AuditLog): InternalMessageLogDetails {
  const parsed = parseLogDetails(log.details);
  return {
    subject: typeof parsed.subject === "string" ? parsed.subject : "No subject",
    message: typeof parsed.message === "string" ? parsed.message : "",
    category: typeof parsed.category === "string" ? parsed.category : "general",
    readAt: typeof parsed.readAt === "string" ? parsed.readAt : null,
    readByAdminId: typeof parsed.readByAdminId === "string" ? parsed.readByAdminId : null,
    deletedAt: typeof parsed.deletedAt === "string" ? parsed.deletedAt : null,
    deletedByAdminId: typeof parsed.deletedByAdminId === "string" ? parsed.deletedByAdminId : null,
  };
}

function serializeInternalMessageLogDetails(details: InternalMessageLogDetails): string {
  return JSON.stringify(details);
}

function isMailboxMessageVisibleForFolder(details: MailboxLogDetails, folder: MailboxFolder): boolean {
  return folder === "sent" ? !details.deletedBySenderAt : !details.deletedByRecipientAt;
}

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
  summaryType: z.enum(["brief", "detailed", "handover", "discharge", "patient_instructions"]).optional(),
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

const submitInternalMessageSchema = z.object({
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(150, "Subject is too long"),
  message: z.string().trim().min(1, "Message is required").max(5000, "Message is too long"),
  category: z.enum(["general", "support", "billing", "bug", "feature"]).default("general"),
});

const sendMailboxMessageSchema = z.object({
  recipientUserId: z.string().trim().min(1, "Recipient User ID is required").max(128, "Recipient User ID is too long"),
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(150, "Subject is too long"),
  message: z.string().trim().min(1, "Message is required").max(5000, "Message is too long"),
});

const updateMessageSelectionSchema = z.object({
  messageIds: z.array(z.number().int().positive()).min(1, "Select at least one message").max(200, "Too many messages selected"),
});

const sendSupportEmailSchema = z.object({
  to: z.string().trim().email("A valid recipient email is required"),
  subject: z.string().trim().min(1, "Subject is required").max(200, "Subject is too long"),
  body: z.string().trim().min(1, "Message is required").max(50000, "Message is too long"),
});

const moveSupportEmailMessageSchema = z.object({
  destination: z.enum(["inbox", "archive", "trash"]),
});

const updateMailboxDirectoryPreferenceSchema = z.object({
  listInDirectory: z.boolean(),
});

const updateAdminAiSettingsSchema = z.object({
  preferredSource: z.enum(["personal", "replit"]),
  textModel: z.enum(ADMIN_AI_TEXT_MODELS),
  monthlyBudgetUsd: z.number().min(0).max(1_000_000).nullable(),
});

const saveAdminPersonalAiKeySchema = z.object({
  personalApiKey: z.string().trim().min(10, "OpenAI API key is too short"),
});

const NUMERIC_IDENTIFIER_REGEX = /^[\d+\-().\s]+$/;

const getMailboxDisplayName = (recipient: {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}) => {
  const fullName = `${recipient.firstName || ""} ${recipient.lastName || ""}`.trim();
  if (fullName) return fullName;

  const emailLocalPart = recipient.email ? recipient.email.split("@")[0]?.trim() : "";
  if (emailLocalPart && NUMERIC_IDENTIFIER_REGEX.test(emailLocalPart)) {
    return emailLocalPart;
  }

  if (NUMERIC_IDENTIFIER_REGEX.test(recipient.id)) {
    return recipient.id;
  }

  return recipient.email || recipient.id;
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const serveAppleAppSiteAssociation = (_req: Request, res: Response) => {
    const payload = buildAppleAppSiteAssociationPayload();
    if (!payload) {
      return res.status(404).json({
        error: "Apple app association is not configured.",
      });
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.send(JSON.stringify(payload));
  };

  app.get("/.well-known/apple-app-site-association", serveAppleAppSiteAssociation);
  app.get("/apple-app-site-association", serveAppleAppSiteAssociation);

  // Register external API routes (for third-party integrations like urgent care)
  app.use("/api/external/v1", externalApiRoutes);
  app.use("/api/mobile", mobileApiRoutes);
  app.use("/api/fhir/r4", fhirRoutes);

  try {
    await initializeAiProviderPreference();
  } catch (error) {
    console.error("Failed to initialize AI provider preference:", error);
  }
  try {
    await initializeAiGenerationSettings();
  } catch (error) {
    console.error("Failed to initialize AI generation settings:", error);
  }
  try {
    await initializeSavedPersonalAiKey();
  } catch (error) {
    console.error("Failed to initialize saved personal AI key:", error);
  }
  
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
      const userEmail = req.user.claims.email;
      const consumeNoteCredit = req.body?.consumeNoteCredit === true;
      const validationResult = insertNoteSchema.safeParse({ userId, ...req.body });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten().fieldErrors 
        });
      }

      if (consumeNoteCredit) {
        const entitlement = await getUserNoteCreditState({ userId, userEmail });
        if (!entitlement.canConsumeCredit) {
          return res.status(402).json(createNoteCreditExceededPayload(entitlement));
        }
      }
      
      const note = await storage.createNote(validationResult.data);
      if (consumeNoteCredit) {
        await storage.recordNoteCreditIfNeeded(userId, note.id);
      }
      
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
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const consumeNoteCredit = req.body?.consumeNoteCredit === true;
      const existingNote = await storage.getNote(noteId);
      
      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      if (existingNote.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      
      const validationResult = updateNoteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten().fieldErrors 
        });
      }

      if (consumeNoteCredit) {
        const entitlement = await getUserNoteCreditState({
          userId,
          userEmail,
          existingNote,
        });
        if (!entitlement.canConsumeCredit) {
          return res.status(402).json(createNoteCreditExceededPayload(entitlement));
        }
      }
      
      const updated = await storage.updateNote(noteId, validationResult.data);
      if (updated && consumeNoteCredit) {
        await storage.recordNoteCreditIfNeeded(userId, noteId);
      }
      
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

  app.post("/api/notes/:id/regenerate-from-transcript", isAuthenticated, async (req: any, res: Response) => {
    try {
      const noteId = parseInt(req.params.id, 10);
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const existingNote = await storage.getNote(noteId);

      if (!existingNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      if (existingNote.userId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const validationResult = regenerateNoteFromTranscriptSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.flatten().fieldErrors,
        });
      }

      const {
        transcript,
        patientName,
        specialty,
        templateId,
        outputLanguage,
        context,
        noDefaultTemplate,
        speakerSegments,
        icdCodes,
        consumeNoteCredit,
        noteStyle,
      } = validationResult.data;

      if (consumeNoteCredit) {
        const entitlement = await getUserNoteCreditState({
          userId,
          userEmail,
          existingNote,
        });
        if (!entitlement.canConsumeCredit) {
          return res.status(402).json(createNoteCreditExceededPayload(entitlement));
        }
      }

      const [settings, vocabulary] = await Promise.all([
        storage.getUserSettings(userId),
        getGlobalMedicalVocabulary(),
      ]);

      let effectiveTemplateId = templateId;
      let customPrompt: string | undefined;

      if (!effectiveTemplateId && !noDefaultTemplate) {
        effectiveTemplateId = await storage.getDefaultTemplateId(userId);
      }

      if (effectiveTemplateId) {
        const template = await storage.getTemplate(effectiveTemplateId);
        if (template) {
          customPrompt = template.prompt;
        }
      }

      const selectedSoapModel = getAdminAiTextModel();
      const { note: soapNote, modelUsed: soapModelUsed, pipeline } =
        await generateClinicalNoteFromTranscript({
          transcript,
          patientName: patientName ?? existingNote.patientName ?? undefined,
          specialty: specialty || existingNote.specialty || "general",
          noteStyle: noteStyle ?? settings?.noteStyle ?? undefined,
          customPrompt,
          outputLanguage,
          context: context ?? existingNote.patientContext ?? undefined,
          speakerSegments,
          vocabularyTerms: vocabulary.terms,
          label: "regenerate-note-from-transcript",
        });

      if (pipeline.fallbackReason) {
        console.warn(
          "[regenerate-note-from-transcript] Fallback used:",
          pipeline.fallbackReason || `${selectedSoapModel} -> ${soapModelUsed}`,
        );
        console.warn(
          "[regenerate-note-from-transcript] Attempt trace:",
          pipeline.soapAttemptTrace.join(" | "),
        );
      }

      const noteSections = buildStoredNoteSections(soapNote);
      const updated = await storage.updateNote(noteId, {
        patientName: patientName ?? existingNote.patientName ?? null,
        transcript,
        patientContext: context ?? existingNote.patientContext ?? null,
        templateId: effectiveTemplateId ?? existingNote.templateId ?? null,
        icdCodes: icdCodes ?? null,
        ...noteSections,
      });

      if (!updated) {
        return res.status(500).json({ error: "Failed to update note" });
      }

      if (consumeNoteCredit) {
        await storage.recordNoteCreditIfNeeded(userId, noteId);
      }

      res.set("X-DocuWhisper-SOAP-Model", soapModelUsed);
      res.set("X-DocuWhisper-SOAP-Selected-Model", selectedSoapModel);
      res.set("X-DocuWhisper-SOAP-Cleanup-Model", pipeline.cleanupModel);
      if (pipeline.fallbackReason) {
        res.set("X-DocuWhisper-SOAP-Fallback-Reason", pipeline.fallbackReason);
      }
      if (pipeline.soapAttemptTrace.length > 0) {
        res.set("X-DocuWhisper-SOAP-Attempt-Trace", pipeline.soapAttemptTrace.join(" | "));
      }
      res.set(
        "X-DocuWhisper-SOAP-Used-Long-Summary",
        pipeline.usedLongTranscriptSummaries ? "1" : "0",
      );

      res.json(updated);
    } catch (error) {
      console.error("Error regenerating note from transcript:", error);
      const debugTrace =
        error && typeof error === "object" && Array.isArray((error as { soapAttemptTrace?: unknown[] }).soapAttemptTrace)
          ? (error as { soapAttemptTrace: unknown[] }).soapAttemptTrace.join(" | ")
          : "";
      if (debugTrace) {
        console.error("[regenerate-note-from-transcript] Failed attempt trace:", debugTrace);
      }

      const payload: Record<string, string> = { error: "Failed to regenerate note from transcript" };
      if (canExposeSoapDebug(req) && debugTrace) {
        payload.debugTrace = debugTrace;
        if (error instanceof Error && error.message) {
          payload.debugReason = error.message;
        }
      }
      res.status(500).json(payload);
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

  app.get("/api/backup/export", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email ?? null;
      const exportedAt = new Date();
      const filenameTimestamp = exportedAt.toISOString().replace(/[:.]/g, "-");

      const [
        settings,
        subscription,
        scribeNotes,
        templates,
        tasks,
        ownedPatients,
        ownedAppointments,
        emrOrganizations,
      ] = await Promise.all([
        storage.getUserSettings(userId),
        storage.getSubscription(userId),
        storage.getNotesByUser(userId),
        storage.getTemplatesByUser(userId),
        storage.getTasksByUser(userId),
        storage.getPatientsByUser(userId),
        storage.getAppointmentsByUser(userId),
        storage.getUserEmrOrganizations(userId),
      ]);

      const organizationIds = Array.from(new Set(emrOrganizations.map((org) => org.practice.id)));

      const [organizationPatients, organizationAppointments] = await Promise.all([
        Promise.all(organizationIds.map((organizationId) => storage.getPatientsByOrganization(organizationId))),
        Promise.all(organizationIds.map((organizationId) => storage.getAppointmentsByOrganization(organizationId))),
      ]);

      const patientMap = new Map<number, any>();
      for (const patient of ownedPatients) {
        patientMap.set(patient.id, patient);
      }
      for (const patientsForOrg of organizationPatients) {
        for (const patient of patientsForOrg) {
          patientMap.set(patient.id, patient);
        }
      }
      const allPatients = Array.from(patientMap.values());

      const appointmentMap = new Map<number, any>();
      for (const appointment of ownedAppointments) {
        appointmentMap.set(appointment.id, appointment);
      }
      for (const appointmentsForOrg of organizationAppointments) {
        for (const appointment of appointmentsForOrg) {
          appointmentMap.set(appointment.id, appointment);
        }
      }
      const allAppointments = Array.from(appointmentMap.values());

      const perPatientData = await Promise.all(
        allPatients.map(async (patient) => {
          const [vitals, encounters, documents, linkedNotes] = await Promise.all([
            storage.getVitalsByPatient(patient.id),
            storage.getEncountersByPatient(patient.id),
            storage.getDocumentsByPatient(patient.id),
            storage.getNotesByPatient(patient.id),
          ]);

          return {
            vitals,
            encounters,
            documents,
            linkedNotes,
          };
        }),
      );

      const allVitals = perPatientData.flatMap((entry) => entry.vitals);
      const allEncounters = perPatientData.flatMap((entry) => entry.encounters);
      const allDocuments = perPatientData.flatMap((entry) => entry.documents);
      const linkedNoteMap = new Map<number, any>();
      for (const note of perPatientData.flatMap((entry) => entry.linkedNotes)) {
        linkedNoteMap.set(note.id, note);
      }
      const allLinkedEmrNotes = Array.from(linkedNoteMap.values());

      const backupPayload = {
        version: 1,
        exportedAt: exportedAt.toISOString(),
        account: {
          userId,
          email: userEmail,
          settings,
          subscription,
          emrOrganizations,
        },
        scribe: {
          notes: scribeNotes,
          templates,
          tasks,
        },
        emr: {
          patients: allPatients,
          appointments: allAppointments,
          encounters: allEncounters,
          vitals: allVitals,
          documents: allDocuments,
          linkedNotes: allLinkedEmrNotes,
        },
      };

      await logAudit(req, "export", "backup", undefined, undefined, {
        scope: "scribe_emr",
        counts: {
          scribeNotes: scribeNotes.length,
          templates: templates.length,
          tasks: tasks.length,
          patients: allPatients.length,
          appointments: allAppointments.length,
          encounters: allEncounters.length,
          vitals: allVitals.length,
          documents: allDocuments.length,
          linkedNotes: allLinkedEmrNotes.length,
        },
      });

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=\"docuwhisper-backup-${filenameTimestamp}.json\"`);
      res.status(200).send(JSON.stringify(backupPayload, null, 2));
    } catch (error) {
      console.error("Error exporting backup data:", error);
      res.status(500).json({ error: "Failed to export backup data" });
    }
  });

  const transcribeRateLimit = new Map<string, number[]>();
  const TRANSCRIBE_WINDOW_MS = 10_000;
  const TRANSCRIBE_MAX_REQUESTS = 5;

  function checkTranscribeRateLimit(userId: string): boolean {
    const now = Date.now();
    const timestamps = transcribeRateLimit.get(userId) || [];
    const recent = timestamps.filter((t) => now - t < TRANSCRIBE_WINDOW_MS);
    if (recent.length >= TRANSCRIBE_MAX_REQUESTS) return false;
    recent.push(now);
    transcribeRateLimit.set(userId, recent);
    return true;
  }

  setInterval(() => {
    const now = Date.now();
    transcribeRateLimit.forEach((timestamps, userId) => {
      const recent = timestamps.filter((t: number) => now - t < TRANSCRIBE_WINDOW_MS);
      if (recent.length === 0) transcribeRateLimit.delete(userId);
      else transcribeRateLimit.set(userId, recent);
    });
  }, 60_000);

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

  const percentile = (values: number[], p: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    const clampedIdx = Math.min(Math.max(idx, 0), sorted.length - 1);
    return sorted[clampedIdx];
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
        channel: "web",
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
        console.warn("[transcribe-metric] failed to persist metric:", error);
      });
  };

  const logTranscriptionMetric = (payload: Record<string, unknown>) => {
    if (shouldLogVerboseAiDetails) {
      console.log("[transcribe-metric]", JSON.stringify(payload));
    }
    persistTranscriptionMetric(payload);
  };

  const TRANSCRIPTION_ALERT_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const TRANSCRIPTION_ALERT_WINDOW_HOURS = 1;
  const TRANSCRIPTION_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
  const TRANSCRIPTION_ALERT_MIN_REQUESTS = 10;
  const TRANSCRIPTION_ALERT_THRESHOLDS = {
    fallbackRate: 0.1, // 10%
    errorRate: 0.03, // 3%
    p95LatencyMs: 8000, // 8s
  };
  const transcriptionAlertCooldowns = new Map<string, number>();

  const sendTranscriptionAlert = async (
    key: string,
    subject: string,
    message: string,
    details: Record<string, unknown>,
  ) => {
    const now = Date.now();
    const lastSentAt = transcriptionAlertCooldowns.get(key) ?? 0;
    if (now - lastSentAt < TRANSCRIPTION_ALERT_COOLDOWN_MS) {
      return;
    }

    await storage.createAuditLog({
      userId: "system-monitor",
      userEmail: "monitor@docuwhisper.local",
      action: "alerted",
      resourceType: "internal_message",
      details: JSON.stringify({
        subject,
        message,
        category: "monitoring",
        source: "transcription_monitor",
        ...details,
      }),
      ipAddress: "127.0.0.1",
      userAgent: "docuwhisper-monitor/1.0",
    });

    transcriptionAlertCooldowns.set(key, now);
    console.warn(`[transcription-alert] ${subject}`);
  };

  const runTranscriptionAlertCheck = async () => {
    try {
      const startDate = new Date(Date.now() - TRANSCRIPTION_ALERT_WINDOW_HOURS * 60 * 60 * 1000);
      const metrics = await storage.getTranscriptionMetrics({ startDate, limit: 5000 });

      let requests = 0;
      let errors = 0;
      let fallbacks = 0;
      const latencies: number[] = [];

      for (const row of metrics) {
        if (row.eventType === "request") {
          requests += 1;
          continue;
        }
        if (row.eventType === "error") {
          errors += 1;
        } else if (row.eventType === "fallback") {
          fallbacks += 1;
        }
        if (
          (row.eventType === "success" || row.eventType === "error") &&
          typeof row.latencyMs === "number" &&
          Number.isFinite(row.latencyMs)
        ) {
          latencies.push(row.latencyMs);
        }
      }

      if (requests < TRANSCRIPTION_ALERT_MIN_REQUESTS) {
        return;
      }

      const fallbackRate = requests > 0 ? fallbacks / requests : 0;
      const errorRate = requests > 0 ? errors / requests : 0;
      const p95LatencyMs = Math.round(percentile(latencies, 95));

      if (fallbackRate > TRANSCRIPTION_ALERT_THRESHOLDS.fallbackRate) {
        await sendTranscriptionAlert(
          "fallback-rate",
          `Transcription fallback rate high (${(fallbackRate * 100).toFixed(1)}%)`,
          `Fallback rate exceeded threshold in the last ${TRANSCRIPTION_ALERT_WINDOW_HOURS} hour(s).`,
          {
            metric: "fallback_rate",
            metricValue: fallbackRate,
            threshold: TRANSCRIPTION_ALERT_THRESHOLDS.fallbackRate,
            requests,
            fallbacks,
            windowHours: TRANSCRIPTION_ALERT_WINDOW_HOURS,
            checkedAt: new Date().toISOString(),
          },
        );
      }

      if (errorRate > TRANSCRIPTION_ALERT_THRESHOLDS.errorRate) {
        await sendTranscriptionAlert(
          "error-rate",
          `Transcription error rate high (${(errorRate * 100).toFixed(1)}%)`,
          `Error rate exceeded threshold in the last ${TRANSCRIPTION_ALERT_WINDOW_HOURS} hour(s).`,
          {
            metric: "error_rate",
            metricValue: errorRate,
            threshold: TRANSCRIPTION_ALERT_THRESHOLDS.errorRate,
            requests,
            errors,
            windowHours: TRANSCRIPTION_ALERT_WINDOW_HOURS,
            checkedAt: new Date().toISOString(),
          },
        );
      }

      if (p95LatencyMs > TRANSCRIPTION_ALERT_THRESHOLDS.p95LatencyMs) {
        await sendTranscriptionAlert(
          "p95-latency",
          `Transcription p95 latency high (${p95LatencyMs.toLocaleString()} ms)`,
          `Latency exceeded threshold in the last ${TRANSCRIPTION_ALERT_WINDOW_HOURS} hour(s).`,
          {
            metric: "p95_latency_ms",
            metricValue: p95LatencyMs,
            threshold: TRANSCRIPTION_ALERT_THRESHOLDS.p95LatencyMs,
            requests,
            samples: latencies.length,
            windowHours: TRANSCRIPTION_ALERT_WINDOW_HOURS,
            checkedAt: new Date().toISOString(),
          },
        );
      }
    } catch (error) {
      console.error("Error running transcription alert check:", error);
    }
  };

  setInterval(() => {
    void runTranscriptionAlertCheck();
  }, TRANSCRIPTION_ALERT_CHECK_INTERVAL_MS);

  setTimeout(() => {
    void runTranscriptionAlertCheck();
  }, 60_000);

  app.get("/api/transcription-provider", isAuthenticated, async (_req: any, res: Response) => {
    const status = getTranscriptionProviderStatus();
    res.json(status);
  });

  app.post("/api/transcribe", isAuthenticated, upload.single("audio"), async (req: any, res: Response) => {
    const startedAt = Date.now();
    let chunkId: number | undefined;
    let sessionId: string | undefined;
    let retryAttempt = 0;
    let maxRetries = 0;
    let providerUsed: "local" | "openai" = "openai";
    let fallbackUsed = false;

    try {
      const userId = req.user?.claims?.sub || req.user?.id || req.sessionID || "unknown";
      if (!checkTranscribeRateLimit(String(userId))) {
        return res.status(429).json({ error: "Too many transcription requests. Please wait a few seconds." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const language = req.body?.language;
      chunkId = req.body?.chunk_id ? parseInt(req.body.chunk_id, 10) : undefined;
      sessionId = req.body?.session_id || undefined;
      retryAttempt = parseOptionalInt(req.body?.retry_attempt) ?? 0;
      maxRetries = parseOptionalInt(req.body?.max_retries) ?? 0;
      const providerStatus = getTranscriptionProviderStatus();
      providerUsed = providerStatus.provider;

      logVerboseAiDetails("Transcription request received:", {
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        language: language || "auto-detect",
        chunk_id: chunkId,
        session_id: sessionId ? sessionId.slice(0, 8) + "..." : undefined,
        retry_attempt: retryAttempt,
        max_retries: maxRetries,
        configured_provider: providerStatus.configuredProvider,
        provider: providerUsed,
      });

      if (providerStatus.reason) {
        console.warn(`[transcribe] ${providerStatus.reason}`);
      }

      logTranscriptionMetric({
        event: "request",
        user_id: String(userId),
        chunk_id: chunkId ?? null,
        session_id: sessionId || null,
        provider: providerUsed,
        configured_provider: providerStatus.configuredProvider,
        fallback_used: false,
        retry_attempt: retryAttempt,
        max_retries: maxRetries,
        language: language || "auto-detect",
        audio_bytes: req.file.size,
      });

      const audioBuffer = req.file.buffer;

      const vocabulary = await getGlobalMedicalVocabulary();
      const vocabularyPrompt = buildMedicalVocabularyPrompt(vocabulary.terms, 260);

      let transcript: string;
      if (providerUsed === "local") {
        try {
          transcript = await transcribeLocal(audioBuffer, language, vocabularyPrompt || undefined);
        } catch (localError: unknown) {
          fallbackUsed = true;
          const fallbackErrorType = classifyTranscriptionError(localError);
          const fallbackMessage = localError instanceof Error ? localError.message : String(localError);
          providerUsed = "openai";

          console.warn(`[transcribe] Local STT failed, falling back to OpenAI: ${fallbackMessage}`);
          logTranscriptionMetric({
            event: "fallback",
            chunk_id: chunkId ?? null,
            session_id: sessionId || null,
            provider: "local",
            fallback_provider: "openai",
            error_type: fallbackErrorType,
            retry_attempt: retryAttempt,
            max_retries: maxRetries,
          });

          transcript = await transcribeLongAudio(audioBuffer, language, !!vocabularyPrompt, vocabularyPrompt || undefined);
        }
      } else {
        transcript = await transcribeLongAudio(audioBuffer, language, !!vocabularyPrompt, vocabularyPrompt || undefined);
      }
      logVerboseAiDetails("Transcription successful, length:", transcript.length);

      const latencyMs = Date.now() - startedAt;
      logTranscriptionMetric({
        event: "success",
        chunk_id: chunkId ?? null,
        session_id: sessionId || null,
        provider: providerUsed,
        fallback_used: fallbackUsed,
        latency_ms: latencyMs,
        retry_attempt: retryAttempt,
        max_retries: maxRetries,
        transcript_chars: transcript.length,
      });

      res.json({
        text: transcript,
        transcript,
        chunk_id: chunkId,
        session_id: sessionId,
        provider: providerUsed,
        fallback_used: fallbackUsed,
      });
    } catch (error: any) {
      const latencyMs = Date.now() - startedAt;
      const errorType = classifyTranscriptionError(error);
      console.error("Error transcribing audio:", error);
      logVerboseAiErrorDetails("Error details:", {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        response: error?.response?.data,
        chunk_id: chunkId,
        session_id: sessionId,
        provider: providerUsed,
        fallback_used: fallbackUsed,
        retry_attempt: retryAttempt,
        max_retries: maxRetries,
        error_type: errorType,
        latency_ms: latencyMs,
      });
      logTranscriptionMetric({
        event: "error",
        chunk_id: chunkId ?? null,
        session_id: sessionId || null,
        provider: providerUsed,
        fallback_used: fallbackUsed,
        retry_attempt: retryAttempt,
        max_retries: maxRetries,
        error_type: errorType,
        latency_ms: latencyMs,
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
      
      const {
        transcript,
        patientName,
        specialty,
        templateId,
        aiInstructions,
        outputLanguage,
        context,
        noDefaultTemplate,
        speakerSegments,
        noteId,
        enforceNoteCredit,
        noteStyle,
      } = validationResult.data;
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const vocabulary = await getGlobalMedicalVocabulary();
      const settings = await storage.getUserSettings(userId);

      if (enforceNoteCredit) {
        let existingNote: BillingNote | null = null;
        if (noteId) {
          const note = await storage.getNote(noteId);
          if (!note || note.userId !== userId) {
            return res.status(404).json({ error: "Note not found" });
          }
          existingNote = note;
        }

        const entitlement = await getUserNoteCreditState({
          userId,
          userEmail,
          existingNote,
        });
        if (!entitlement.canConsumeCredit) {
          return res.status(402).json(createNoteCreditExceededPayload(entitlement));
        }
      }
      
      logVerboseAiDetails("SOAP generation request - transcript length:", transcript.length);
      logVerboseAiDetails("SOAP generation request - output language:", outputLanguage || "en");
      logVerboseAiDetails("SOAP generation request - context provided:", !!context);
      logVerboseAiDetails("SOAP generation request - noDefaultTemplate:", !!noDefaultTemplate);

      let customPrompt = "";
      let effectiveTemplateId = templateId;
      
      // If no template specified and user didn't explicitly request no template,
      // check for user's default template setting.
      if (!effectiveTemplateId && !noDefaultTemplate) {
        effectiveTemplateId = await storage.getDefaultTemplateId(userId);
        if (effectiveTemplateId) {
          logVerboseAiDetails("SOAP generation - using user's default template:", effectiveTemplateId);
        }
      }
      
      if (effectiveTemplateId) {
        const template = await storage.getTemplate(effectiveTemplateId);
        if (template) {
          customPrompt = template.prompt;
          logVerboseAiDetails("SOAP generation - using custom template prompt:", template.name);
        }
      }

      const selectedSoapModel = getAdminAiTextModel();
      const { note: soapNote, modelUsed: soapModelUsed, pipeline } =
        await generateClinicalNoteFromTranscript({
          transcript,
          patientName,
          specialty,
          noteStyle: noteStyle ?? settings?.noteStyle ?? undefined,
          customPrompt,
          aiInstructions,
          outputLanguage,
          context,
          speakerSegments,
          vocabularyTerms: vocabulary.terms,
          label: "generate-soap",
        });

      logVerboseAiDetails("[generate-soap] Model used:", soapModelUsed, "selected model:", selectedSoapModel);
      const hpiText = typeof soapNote.hpi === "string" ? soapNote.hpi : "";
      const subjectiveText = typeof soapNote.subjective === "string" ? soapNote.subjective : "";
      const objectiveText = typeof soapNote.objective === "string" ? soapNote.objective : "";
      const assessmentText = typeof soapNote.assessment === "string" ? soapNote.assessment : "";
      const planText = typeof soapNote.plan === "string" ? soapNote.plan : "";
      logVerboseAiDetails("[generate-soap] Cleanup model:", pipeline.cleanupModel);
      logVerboseAiDetails(
        "[generate-soap] Transcript tokens:",
        pipeline.originalEstimatedTokens,
        "->",
        pipeline.condensedEstimatedTokens,
        "used chunk summaries:",
        pipeline.usedLongTranscriptSummaries,
      );
      logVerboseAiDetails("[generate-soap] Parsed note keys:", Object.keys(soapNote));
      logVerboseAiDetails("[generate-soap] Has HPI:", !!hpiText, "Has Plan:", !!planText);
      logVerboseAiDetails("[generate-soap] HPI length:", hpiText.length, "Plan length:", planText.length);
      if (pipeline.fallbackReason) {
        console.warn(
          "[generate-soap] Fallback used:",
          pipeline.fallbackReason || `${selectedSoapModel} -> ${soapModelUsed}`,
        );
        console.warn("[generate-soap] Attempt trace:", pipeline.soapAttemptTrace.join(" | "));
      }

      res.set("X-DocuWhisper-SOAP-Model", soapModelUsed);
      res.set("X-DocuWhisper-SOAP-Selected-Model", selectedSoapModel);
      res.set("X-DocuWhisper-SOAP-Cleanup-Model", pipeline.cleanupModel);
      if (pipeline.fallbackReason) {
        res.set("X-DocuWhisper-SOAP-Fallback-Reason", pipeline.fallbackReason);
      }
      if (pipeline.soapAttemptTrace.length > 0) {
        res.set("X-DocuWhisper-SOAP-Attempt-Trace", pipeline.soapAttemptTrace.join(" | "));
      }
      res.set(
        "X-DocuWhisper-SOAP-Used-Long-Summary",
        pipeline.usedLongTranscriptSummaries ? "1" : "0",
      );
      res.json(soapNote);
    } catch (error) {
      console.error("Error generating SOAP note:", error);
      const debugTrace =
        error && typeof error === "object" && Array.isArray((error as { soapAttemptTrace?: unknown[] }).soapAttemptTrace)
          ? (error as { soapAttemptTrace: unknown[] }).soapAttemptTrace.join(" | ")
          : "";
      if (debugTrace) {
        console.error("[generate-soap] Failed attempt trace:", debugTrace);
      }
      const payload: Record<string, string> = { error: "Failed to generate SOAP note" };
      if (canExposeSoapDebug(req) && debugTrace) {
        payload.debugTrace = debugTrace;
        if (error instanceof Error && error.message) {
          payload.debugReason = error.message;
        }
      }
      res.status(500).json(payload);
    }
  });

  // Generate title from transcript (extract symptoms/complaints)
  app.post("/api/generate-title", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { transcript } = req.body;
      
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "Transcript is required" });
      }

      const title = await generateClinicalTitleFromTranscript({
        transcript,
        label: "generate-title",
      });

      res.json({ title });
    } catch (error) {
      console.error("Error generating title:", error);
      res.status(500).json({ error: "Failed to generate title" });
    }
  });

  // AI Differential Diagnosis & Labs Search
  app.post("/api/ai/differential-search", isAuthenticated, async (req: any, res: Response) => {
    try {
      const { caseDetails } = req.body;
      
      if (!caseDetails || typeof caseDetails !== "string") {
        return res.status(400).json({ error: "Case details are required" });
      }

      const response = await openai.chat.completions.create({
        model: getAdminAiTextModel(),
        messages: [
          { 
            role: "system", 
            content: `You are an expert clinical decision support assistant helping healthcare providers with difficult cases.

Given the patient case details, provide:
1. DIFFERENTIAL DIAGNOSES: List the most likely diagnoses ranked by probability, including both common and rare conditions that should be considered
2. RECOMMENDED LABS/TESTS: Suggest laboratory tests and diagnostic studies that would help narrow down the diagnosis
3. RED FLAGS: Identify any concerning features that require urgent workup or specialist referral
4. CLINICAL PEARLS: Brief insights or tips specific to this presentation

Format your response as valid JSON:
{
  "differentials": [
    { "diagnosis": "Condition name", "likelihood": "High/Medium/Low", "rationale": "Brief explanation" }
  ],
  "recommendedLabs": [
    { "test": "Test name", "purpose": "Why this test helps" }
  ],
  "redFlags": ["List of concerning features if any"],
  "clinicalPearls": ["Helpful clinical insights"]
}

Be thorough but practical. Focus on actionable recommendations.`
          },
          { role: "user", content: `Case Details:\n${caseDetails}` }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content || '{"differentials": [], "recommendedLabs": [], "redFlags": [], "clinicalPearls": []}';
      const result = JSON.parse(content);

      res.json(result);
    } catch (error) {
      console.error("Error searching differentials:", error);
      res.status(500).json({ error: "Failed to search differentials" });
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
        model: getAdminAiTextModel(),
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
        model: getAdminAiTextModel(),
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
      const vocabulary = await getGlobalMedicalVocabulary();
      const vocabularyPrompt = buildMedicalVocabularyPrompt(vocabulary.terms, 220);
      
      const clinicalContent = `
SUBJECTIVE: ${subjective || ""}
OBJECTIVE: ${objective || ""}
ASSESSMENT: ${assessment || ""}
PLAN: ${plan || ""}
      `.trim();

      const response = await openai.chat.completions.create({
        model: getAdminAiTextModel(),
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
  ],
  "priorAuthDxCodes": [
    {
      "code": "ICD-10 code that supports prior authorization when applicable",
      "description": "Diagnosis description",
      "medication": "Related medication or therapy if mentioned",
      "rationale": "Why this code may support PA documentation",
      "confidence": "high" | "medium" | "low"
    }
  ]
}

Suggest the most relevant codes based on the documented findings. Include both primary diagnosis and any relevant secondary diagnoses. Also suggest an appropriate E/M CPT code based on the complexity of the visit.

If medications/biologics likely requiring prior authorization are documented or implied, include supporting ICD-10 codes in "priorAuthDxCodes". If not applicable, return an empty array.

${vocabularyPrompt ? `Spelling guidance:\n${vocabularyPrompt}` : ""}`
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
        model: getAdminAiTextModel(),
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
        model: getAdminAiTextModel(),
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
        model: getAdminAiTextModel(),
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
        discharge: "Generate discharge summary instructions for the patient including diagnosis, treatment, and follow-up.",
        patient_instructions: "Write patient-facing after-visit instructions in plain language. Include: visit reason, what the patient reported, assessment/diagnosis (if available), medication changes (start/stop/continue if mentioned), home care instructions, follow-up plan, and return precautions. Use short paragraphs or bullet points and avoid medical jargon. If details are missing, state 'Not specified' rather than leaving sections blank, and still include general follow-up and return precautions."
      };

      const instruction = typeInstructions[summaryType || "brief"] || typeInstructions.brief;

      const response = await openai.chat.completions.create({
        model: getAdminAiTextModel(),
        messages: [
          { 
            role: "system", 
            content: `You are a medical documentation assistant. ${instruction}`
          },
          { role: "user", content: soapContent }
        ],
        max_completion_tokens: 800,
      });

      let summary = response.choices[0]?.message?.content || "";
      summary = summary.trim();

      if (!summary && summaryType === "patient_instructions") {
        const fallbackLines: string[] = [];
        fallbackLines.push("Today we saw you for a visit.");
        if (subjective) fallbackLines.push(`You reported: ${subjective}`);
        if (assessment) fallbackLines.push(`Assessment/Diagnosis: ${assessment}`);
        if (plan) fallbackLines.push(`Plan/Instructions: ${plan}`);
        if (objective) fallbackLines.push(`Exam/Tests: ${objective}`);
        fallbackLines.push("Follow-up: Not specified.");
        fallbackLines.push("Return precautions: If symptoms worsen or you have concerns, seek medical care.");
        summary = fallbackLines.join("\n");
      }

      res.json({ summary });
    } catch (error) {
      console.error("Error generating summary:", error);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  // AI Drug Interaction Check - fallback when database doesn't have medications
  app.post("/api/ai-drug-interactions", isAuthenticated, async (req: any, res: Response) => {
    try {
      // Validate input with Zod
      const inputSchema = z.object({
        medications: z.array(z.string().min(1).max(100)).min(2).max(50)
      });
      
      const parseResult = inputSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid input", 
          details: parseResult.error.errors,
          interactions: [] 
        });
      }
      
      const { medications } = parseResult.data;

      const response = await openai.chat.completions.create({
        model: getAdminAiTextModel(),
        messages: [
          { 
            role: "system", 
            content: `You are a clinical pharmacist assistant. Analyze the following medications for potential drug-drug interactions. 

IMPORTANT: Brand names and generic names refer to the SAME medication. Do NOT flag an interaction between a brand name and its generic equivalent (e.g., Lipitor and atorvastatin are the same drug, not two separate medications). Treat them as one medication. Only flag true drug-drug interactions between DIFFERENT active ingredients.

For each interaction found, provide:
- The two drugs involved (use generic names)
- Severity level: "high", "moderate", or "low"
- Brief description of the interaction
- Clinical recommendation

Respond ONLY with a valid JSON array of objects with this structure:
[
  {
    "drug1": "medication name",
    "drug2": "medication name", 
    "severity": "high|moderate|low",
    "description": "Brief description of the interaction mechanism",
    "recommendation": "Clinical recommendation for managing this interaction"
  }
]

If no significant interactions are found, return an empty array: []
Focus only on clinically significant interactions. Do not include minor or theoretical interactions.`
          },
          { 
            role: "user", 
            content: `Check for drug interactions between these medications: ${medications.join(", ")}`
          }
        ],
        max_completion_tokens: 1500,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content || "[]";
      
      // Parse and validate the JSON response
      const interactionSchema = z.array(z.object({
        drug1: z.string(),
        drug2: z.string(),
        severity: z.enum(["high", "moderate", "low"]),
        description: z.string(),
        recommendation: z.string()
      }));
      
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          return res.json({ interactions: [], source: "ai", warning: "No interactions found in AI response" });
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        const validated = interactionSchema.safeParse(parsed);
        
        if (!validated.success) {
          console.error("AI response validation failed:", validated.error);
          return res.json({ interactions: [], source: "ai", warning: "AI response format was invalid" });
        }
        
        res.json({ interactions: validated.data, source: "ai" });
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError);
        res.json({ interactions: [], source: "ai", error: "Could not parse AI response" });
      }
    } catch (error) {
      console.error("Error checking AI drug interactions:", error);
      res.status(500).json({ error: "Failed to check drug interactions with AI" });
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

  // Public templates - MUST be before /api/templates/:id to avoid matching "public" as an id
  app.get("/api/templates/public", isAuthenticated, async (req: any, res: Response) => {
    try {
      const templates = await storage.getPublicTemplates();
      console.log("[public-templates] Found", templates.length, "public templates:", templates.map(t => ({ id: t.id, name: t.name, isPublic: t.isPublic })));
      res.json(templates);
    } catch (error) {
      console.error("Error fetching public templates:", error);
      res.status(500).json({ error: "Failed to fetch public templates" });
    }
  });

  // Shared templates (templates shared with current user) - MUST be before /api/templates/:id
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
      console.log("[template-update] Updating template:", templateId, "with data:", JSON.stringify(req.body));
      
      const template = await storage.getTemplate(templateId);
      
      if (!template) {
        console.log("[template-update] Template not found:", templateId);
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.userId !== req.user.claims.sub) {
        console.log("[template-update] Unauthorized - owner:", template.userId, "requester:", req.user.claims.sub);
        return res.status(403).json({ error: "Not authorized to update this template" });
      }
      
      const validationResult = updateTemplateSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        console.log("[template-update] Validation failed:", validationResult.error.flatten().fieldErrors);
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.flatten().fieldErrors 
        });
      }
      
      const updated = await storage.updateTemplate(templateId, validationResult.data);
      console.log("[template-update] Updated successfully:", updated?.id, "new name:", updated?.name);
      
      if (validationResult.data.isDefault) {
        await storage.setDefaultTemplate(req.user.claims.sub, templateId);
      }
      
      res.json(updated);
    } catch (error) {
      console.error("[template-update] Error updating template:", error);
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
          transcriptionMode: "smart",
          noiseThreshold: 15,
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
      const isAdminUser = await hasAdminFeatureAccess(req);
      const settingsPayload = isAdminUser
        ? validatedData
        : {
            ...validatedData,
            emrRole: undefined,
            licenseNumber: undefined,
            licenseState: undefined,
            licenseExpiry: undefined,
            npiNumber: undefined,
            deaNumber: undefined,
            deaExpiry: undefined,
            supervisingPhysicianId: undefined,
            credentials: undefined,
            requiresCosignature: undefined,
          };
      
      const settings = await storage.upsertUserSettings({
        userId,
        ...settingsPayload,
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

  app.get("/api/medical-vocabulary", isAuthenticated, async (_req: any, res: Response) => {
    try {
      const vocabulary = await getGlobalMedicalVocabulary();
      res.json(vocabulary);
    } catch (error) {
      console.error("Error fetching medical vocabulary:", error);
      res.status(500).json({ error: "Failed to fetch medical vocabulary" });
    }
  });

  app.put("/api/medical-vocabulary", isAuthenticated, async (req: any, res: Response) => {
    try {
      const parsed = updateMedicalVocabularySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid medical vocabulary data" });
      }

      const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      const updated = await updateGlobalMedicalVocabulary({
        customTerms: parsed.data.customTerms,
        userId: req.user.claims.sub,
        userEmail: req.user.claims.email,
        ipAddress: typeof ipAddress === "string" ? ipAddress : ipAddress?.[0],
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating medical vocabulary:", error);
      res.status(500).json({ error: "Failed to update medical vocabulary" });
    }
  });

  // Internal user-to-admin inbox (no external email provider required)
  app.post("/api/internal-messages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const parsed = submitInternalMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid message" });
      }

      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      const userAgent = req.headers["user-agent"];

      await storage.createAuditLog({
        userId,
        userEmail,
        action: "submitted",
        resourceType: "internal_message",
        details: serializeInternalMessageLogDetails({
          subject: parsed.data.subject,
          message: parsed.data.message,
          category: parsed.data.category,
          readAt: null,
          readByAdminId: null,
          deletedAt: null,
          deletedByAdminId: null,
        }),
        ipAddress: typeof ipAddress === "string" ? ipAddress : ipAddress?.[0],
        userAgent,
      });

      res.status(201).json({ success: true, message: "Message sent to admin inbox" });
    } catch (error) {
      console.error("Error submitting internal message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.get("/api/mailbox/directory-preference", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const preference = await getMailboxDirectoryPreference(userId);
      res.json(preference);
    } catch (error) {
      console.error("Error fetching mailbox directory preference:", error);
      res.status(500).json({ error: "Failed to fetch mailbox directory preference" });
    }
  });

  app.put("/api/mailbox/directory-preference", isAuthenticated, async (req: any, res: Response) => {
    try {
      const parsed = updateMailboxDirectoryPreferenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid mailbox directory preference" });
      }

      const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      const updated = await updateMailboxDirectoryPreference({
        userId: req.user.claims.sub,
        userEmail: req.user.claims.email,
        listInDirectory: parsed.data.listInDirectory,
        ipAddress: typeof ipAddress === "string" ? ipAddress : ipAddress?.[0],
        userAgent: req.headers["user-agent"],
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating mailbox directory preference:", error);
      res.status(500).json({ error: "Failed to update mailbox directory preference" });
    }
  });

  app.get("/api/mailbox/users/search", isAuthenticated, async (req: any, res: Response) => {
    try {
      const queryParam = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const requestedLimitRaw = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
      const defaultLimit = queryParam ? 100 : 300;
      const safeLimit = Number.isFinite(requestedLimitRaw)
        ? Math.min(Math.max(requestedLimitRaw, 1), 500)
        : defaultLimit;

      const requesterUserId = req.user.claims.sub;
      const [matches, visibilityMap] = await Promise.all([
        storage.searchUsers(queryParam, requesterUserId, safeLimit),
        getMailboxDirectoryVisibilityMap(),
      ]);

      const recipients = matches
        .filter((recipient) => visibilityMap.get(recipient.id) !== false)
        .map((recipient) => {
          const fullName = `${recipient.firstName || ""} ${recipient.lastName || ""}`.trim();
          const displayName = getMailboxDisplayName(recipient);
          return {
            userId: recipient.id,
            email: recipient.email,
            displayName,
            hasName: fullName.length > 0,
            sortValue: (fullName || displayName).toLocaleLowerCase(),
          };
        })
        .sort((a, b) => {
          if (a.hasName !== b.hasName) return a.hasName ? -1 : 1;
          return a.sortValue.localeCompare(b.sortValue, undefined, { sensitivity: "base", numeric: true });
        })
        .map(({ hasName: _hasName, sortValue: _sortValue, ...recipient }) => recipient);

      res.json(recipients);
    } catch (error) {
      console.error("Error searching mailbox recipients:", error);
      res.status(500).json({ error: "Failed to search users" });
    }
  });

  app.get("/api/mailbox/users/:userId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const lookupUserId = String(req.params.userId || "").trim();
      if (!lookupUserId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      const recipient = await storage.getUserById(lookupUserId);
      if (!recipient) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        userId: recipient.id,
        email: recipient.email,
        displayName: getMailboxDisplayName(recipient),
      });
    } catch (error) {
      console.error("Error looking up mailbox recipient:", error);
      res.status(500).json({ error: "Failed to look up user" });
    }
  });

  app.post("/api/mailbox/messages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const parsed = sendMailboxMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid message" });
      }

      const senderUserId = req.user.claims.sub;
      const senderEmail = req.user.claims.email;
      if (parsed.data.recipientUserId === senderUserId) {
        return res.status(400).json({ error: "You cannot send a mailbox message to yourself" });
      }

      const recipient = await storage.getUserById(parsed.data.recipientUserId);
      if (!recipient) {
        return res.status(404).json({ error: "Recipient user was not found" });
      }

      const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      const userAgent = req.headers["user-agent"];
      const recipientDisplayName = getMailboxDisplayName(recipient);

      await storage.createAuditLog({
        userId: senderUserId,
        userEmail: senderEmail,
        action: "sent",
        resourceType: "user_mailbox",
        details: serializeMailboxLogDetails({
          recipientUserId: recipient.id,
          recipientEmail: recipient.email,
          recipientDisplayName,
          subject: parsed.data.subject,
          message: parsed.data.message,
          readAt: null,
          readByUserId: null,
          deletedBySenderAt: null,
          deletedByRecipientAt: null,
        }),
        ipAddress: typeof ipAddress === "string" ? ipAddress : ipAddress?.[0],
        userAgent,
      });

      res.status(201).json({ success: true, message: "Message sent" });
    } catch (error) {
      console.error("Error sending mailbox message:", error);
      res.status(500).json({ error: "Failed to send mailbox message" });
    }
  });

  app.get("/api/mailbox/messages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const folderParam = Array.isArray(req.query.folder) ? req.query.folder[0] : req.query.folder;
      const folder = folderParam === "sent" ? "sent" : "inbox";
      const logs = await storage.getAuditLogs({ resourceType: "user_mailbox" });

      const messages = logs
        .map((log) => {
          const details = parseMailboxLogDetails(log);
          if (!details.recipientUserId) return null;

          const message = {
            id: log.id,
            senderUserId: log.userId,
            senderEmail: log.userEmail,
            recipientUserId: details.recipientUserId,
            recipientEmail: details.recipientEmail,
            recipientDisplayName: details.recipientDisplayName,
            subject: details.subject,
            message: details.message,
            createdAt: log.timestamp,
            isRead: !!details.readAt,
            readAt: details.readAt,
          };

          if (folder === "sent" ? message.senderUserId !== userId : message.recipientUserId !== userId) {
            return null;
          }

          if (!isMailboxMessageVisibleForFolder(details, folder)) {
            return null;
          }

          return message;
        })
        .filter(Boolean);

      res.json(messages);
    } catch (error) {
      console.error("Error fetching mailbox messages:", error);
      res.status(500).json({ error: "Failed to fetch mailbox messages" });
    }
  });

  app.get("/api/mailbox/unread-count", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const logs = await storage.getAuditLogs({ resourceType: "user_mailbox" });

      const unreadCount = logs.reduce((count, log) => {
        const details = parseMailboxLogDetails(log);
        if (details.recipientUserId !== userId) return count;
        if (!isMailboxMessageVisibleForFolder(details, "inbox")) return count;
        return details.readAt ? count : count + 1;
      }, 0);

      res.json({ unreadCount });
    } catch (error) {
      console.error("Error fetching mailbox unread count:", error);
      res.status(500).json({ error: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/mailbox/messages/read", isAuthenticated, async (req: any, res: Response) => {
    try {
      const parsed = updateMessageSelectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const userId = req.user.claims.sub;
      const logs = await storage.getAuditLogsByIds(parsed.data.messageIds);
      const targetLogs = logs.filter((log) => {
        if (log.resourceType !== "user_mailbox") return false;
        const details = parseMailboxLogDetails(log);
        return details.recipientUserId === userId && !details.readAt && !details.deletedByRecipientAt;
      });

      const readAt = new Date().toISOString();
      await Promise.all(
        targetLogs.map((log) => {
          const details = parseMailboxLogDetails(log);
          return storage.updateAuditLog(log.id, {
            details: serializeMailboxLogDetails({
              ...details,
              readAt,
              readByUserId: userId,
            }),
          });
        }),
      );

      res.json({ updated: targetLogs.length });
    } catch (error) {
      console.error("Error marking mailbox messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  app.delete("/api/mailbox/messages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const parsed = updateMessageSelectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const userId = req.user.claims.sub;
      const logs = await storage.getAuditLogsByIds(parsed.data.messageIds);
      const deletedAt = new Date().toISOString();

      const updatableLogs = logs.filter((log) => log.resourceType === "user_mailbox");
      await Promise.all(
        updatableLogs.map((log) => {
          const details = parseMailboxLogDetails(log);
          if (log.userId === userId && !details.deletedBySenderAt) {
            return storage.updateAuditLog(log.id, {
              details: serializeMailboxLogDetails({
                ...details,
                deletedBySenderAt: deletedAt,
              }),
            });
          }

          if (details.recipientUserId === userId && !details.deletedByRecipientAt) {
            return storage.updateAuditLog(log.id, {
              details: serializeMailboxLogDetails({
                ...details,
                deletedByRecipientAt: deletedAt,
              }),
            });
          }

          return Promise.resolve(undefined);
        }),
      );

      res.json({ updated: updatableLogs.length });
    } catch (error) {
      console.error("Error deleting mailbox messages:", error);
      res.status(500).json({ error: "Failed to delete messages" });
    }
  });

  // ===== Personal API Key Management =====
  app.get("/api/personal-api-keys", isAuthenticated, async (req: any, res: Response) => {
    try {
      if (!(await hasAdminFeatureAccess(req))) {
        return res.status(403).json({ error: "Admin access required for API keys" });
      }
      const userId = req.user.claims.sub;
      const keys = await storage.getPersonalApiKeysByUser(userId);
      res.json(keys.map(k => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        status: k.status,
        lastUsedAt: k.lastUsedAt,
        createdAt: k.createdAt,
        revokedAt: k.revokedAt,
      })));
    } catch (error) {
      console.error("Error fetching personal API keys:", error);
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  app.post("/api/personal-api-keys", isAuthenticated, async (req: any, res: Response) => {
    try {
      if (!(await hasAdminFeatureAccess(req))) {
        return res.status(403).json({ error: "Admin access required for API keys" });
      }
      const userId = req.user.claims.sub;
      const { name, scopes } = z.object({
        name: z.string().min(1, "Key name is required"),
        scopes: z.array(z.string()).min(1, "At least one scope is required"),
      }).parse(req.body);

      // Validate scopes
      const validScopes = Object.keys(PERSONAL_API_SCOPES);
      const invalidScopes = scopes.filter(s => !validScopes.includes(s));
      if (invalidScopes.length > 0) {
        return res.status(400).json({ error: `Invalid scopes: ${invalidScopes.join(", ")}` });
      }

      // Limit to 5 active keys per user
      const existingKeys = await storage.getPersonalApiKeysByUser(userId);
      const activeKeys = existingKeys.filter(k => k.status === "active");
      if (activeKeys.length >= 5) {
        return res.status(400).json({ error: "Maximum of 5 active API keys allowed. Revoke an existing key first." });
      }

      const { apiKey, rawKey } = await storage.createPersonalApiKey({
        userId,
        name,
        scopes,
      });

      res.status(201).json({
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        status: apiKey.status,
        createdAt: apiKey.createdAt,
        rawKey, // Only returned once at creation
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error creating personal API key:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.post("/api/personal-api-keys/:id/revoke", isAuthenticated, async (req: any, res: Response) => {
    try {
      if (!(await hasAdminFeatureAccess(req))) {
        return res.status(403).json({ error: "Admin access required for API keys" });
      }
      const userId = req.user.claims.sub;
      const keyId = parseInt(req.params.id);
      
      const keys = await storage.getPersonalApiKeysByUser(userId);
      const key = keys.find(k => k.id === keyId);
      if (!key) {
        return res.status(404).json({ error: "API key not found" });
      }
      
      const revoked = await storage.revokePersonalApiKey(keyId);
      res.json(revoked);
    } catch (error) {
      console.error("Error revoking personal API key:", error);
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

  app.delete("/api/personal-api-keys/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      if (!(await hasAdminFeatureAccess(req))) {
        return res.status(403).json({ error: "Admin access required for API keys" });
      }
      const userId = req.user.claims.sub;
      const keyId = parseInt(req.params.id);
      
      const keys = await storage.getPersonalApiKeysByUser(userId);
      const key = keys.find(k => k.id === keyId);
      if (!key) {
        return res.status(404).json({ error: "API key not found" });
      }
      
      await storage.deletePersonalApiKey(keyId);
      res.json({ message: "API key deleted" });
    } catch (error) {
      console.error("Error deleting personal API key:", error);
      res.status(500).json({ error: "Failed to delete API key" });
    }
  });

  app.get("/api/personal-api-keys/scopes", isAuthenticated, async (req: any, res: Response) => {
    if (!(await hasAdminFeatureAccess(req))) {
      return res.status(403).json({ error: "Admin access required for API keys" });
    }
    res.json(PERSONAL_API_SCOPES);
  });

  app.get("/api/subscription", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const adminAccess = await getAdminAccessContext(req);
      let subscription = await storage.getSubscription(userId);
      subscription = await normalizeExpiredSubscriptionStatus(userId, subscription);
      const accessState = getSubscriptionAccessState(subscription as BillingSubscription | undefined);
      const usage = await storage.getNoteCreditUsageSummary(userId);
      const entitlement = getNoteCreditEntitlement({
        subscription,
        usage,
        isAdmin: adminAccess.isAdmin,
        isSuperAdmin: adminAccess.isSuperAdmin,
      });
      const effectivePlan = getEffectiveSubscriptionPlan(subscription, {
        isAdmin: adminAccess.isAdmin,
        isSuperAdmin: adminAccess.isSuperAdmin,
      });
      let billingInterval: BillingInterval | null = null;

      if (subscription?.stripeSubscriptionId) {
        try {
          const stripe = await getUncachableStripeClient();
          billingInterval = await getStripeSubscriptionBillingInterval(
            stripe,
            subscription.stripeSubscriptionId,
          );
        } catch (error) {
          console.error("Error fetching Stripe billing interval:", error);
        }
      }
      
      res.json({
        status: accessState === "inactive" ? "inactive" : "active",
        accessState,
        hasAccess: entitlement.hasAccess,
        currentPeriodEnd: subscription?.currentPeriodEnd,
        stripeSubscriptionId: subscription?.stripeSubscriptionId,
        canManageBilling: !!subscription?.stripeCustomerId,
        usage: {
          currentPeriodCount: usage.currentPeriodCount,
          totalCount: usage.totalCount,
          currentPeriodStart: usage.currentPeriodStart,
          nextResetAt: usage.nextResetAt,
          includedCredits: entitlement.usage.includedCredits,
          remainingCredits: entitlement.usage.remainingCredits,
          exhausted: entitlement.usage.exhausted,
        },
        plan: {
          code: effectivePlan.code,
          name: effectivePlan.name,
          monthlyPriceCents: effectivePlan.monthlyPriceCents,
          annualPriceCents: effectivePlan.annualPriceCents,
          monthlyNoteAllowance: effectivePlan.monthlyNoteAllowance,
          billingInterval,
          unlimited: effectivePlan.unlimited,
          source: effectivePlan.source,
        },
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ error: "Failed to fetch subscription" });
    }
  });

  app.get("/api/stripe/price", isAuthenticated, async (req: any, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();

      const price = await resolveSubscriptionPriceForPlan(stripe, DEFAULT_SUBSCRIPTION_PLAN_CODE);
      res.json({ price });
    } catch (error) {
      console.error("Error fetching price:", error);
      res.status(500).json({ error: "Failed to fetch price" });
    }
  });

  app.get("/api/stripe/prices", isAuthenticated, async (req: any, res: Response) => {
    try {
      const stripe = await getUncachableStripeClient();
      const prices = await resolveConfiguredSubscriptionPrices(stripe);
      res.json({ prices });
    } catch (error) {
      console.error("Error fetching prices:", error);
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  });

  app.post("/api/stripe/checkout", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const userEmail = req.user.claims.email;
      const parsedBody = z
        .object({
          planCode: z.enum(["starter", "standard", "pro", "unlimited"]).optional(),
          billingInterval: z.enum(["month", "year"]).optional(),
        })
        .safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return res.status(400).json({ error: "Invalid plan selection" });
      }
      const selectedPlanCode = parsedBody.data.planCode ?? DEFAULT_SUBSCRIPTION_PLAN_CODE;
      const selectedBillingInterval = parsedBody.data.billingInterval ?? "month";
      const stripe = await getUncachableStripeClient();

      let subscription = await storage.getSubscription(userId);
      subscription = await normalizeExpiredSubscriptionStatus(userId, subscription);
      if (subscription?.stripeSubscriptionId && getSubscriptionAccessState(subscription as BillingSubscription) === "active") {
        return res.status(400).json({ error: "Use the billing portal to manage an existing subscription." });
      }
      let customerId = subscription?.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: { userId },
        });
        customerId = customer.id;

        if (subscription) {
          await storage.updateSubscription(userId, {
            stripeCustomerId: customerId,
            planCode: subscription.planCode ?? selectedPlanCode,
          });
        } else {
          await storage.upsertSubscription({
            userId,
            stripeCustomerId: customerId,
            planCode: selectedPlanCode,
            status: "inactive",
          });
        }
      }

      if (subscription?.planCode !== selectedPlanCode) {
        await storage.updateSubscription(userId, { planCode: selectedPlanCode });
      }

      const price = await resolveSubscriptionPriceForPlan(
        stripe,
        selectedPlanCode,
        selectedBillingInterval,
      );
      const priceId = price?.id;

      if (!priceId) {
        const selectedPlan = getSubscriptionPlanDefinition(selectedPlanCode);
        return res.status(400).json({
          error: `No Stripe ${selectedBillingInterval === "year" ? "annual" : "monthly"} price configured for ${selectedPlan?.name || selectedPlanCode}.`,
        });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        metadata: {
          userId,
          planCode: selectedPlanCode,
          billingInterval: selectedBillingInterval,
        },
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
  const isAdmin = async (req: any): Promise<boolean> => (await getAdminAccessContext(req)).isAdmin;
  const isSuperAdmin = async (req: any): Promise<boolean> =>
    (await getAdminAccessContext(req)).isSuperAdmin;

  // Admin middleware
  const requireAdmin = async (req: any, res: Response, next: Function) => {
    if (!(await isAdmin(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  const requireSuperAdmin = async (req: any, res: Response, next: Function) => {
    if (!(await isSuperAdmin(req))) {
      return res.status(403).json({ error: "Super admin access required" });
    }
    next();
  };

  // Check if current user is admin
  app.get("/api/admin/check", isAuthenticated, async (req: any, res: Response) => {
    const adminAccess = await getAdminAccessContext(req);
    res.json({ 
      isAdmin: adminAccess.isAdmin,
      isSuperAdmin: adminAccess.isSuperAdmin,
      userEmail: req.user?.claims?.email,
    });
  });

  app.get("/api/admin/support-email/status", isAuthenticated, requireAdmin, async (_req: any, res: Response) => {
    try {
      res.json(getSupportMailboxStatus());
    } catch (error) {
      console.error("Error fetching support mailbox status:", error);
      res.status(500).json({ error: "Failed to fetch support mailbox status" });
    }
  });

  app.get(
    "/api/admin/support-email/unread-count",
    isAuthenticated,
    requireAdmin,
    async (_req: any, res: Response) => {
      try {
        const unreadCount = await getSupportMailboxUnreadCount();
        res.json({ unreadCount });
      } catch (error) {
        console.error("Error fetching support mailbox unread count:", error);
        res.status(500).json({ error: "Failed to fetch support mailbox unread count" });
      }
    },
  );

  app.get("/api/admin/support-email/messages", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const folder: SupportMailboxFolder =
        req.query.folder === "sent" ||
        req.query.folder === "archive" ||
        req.query.folder === "trash"
          ? req.query.folder
          : "inbox";
      const rawLimit =
        typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
      const limit = Number.isFinite(rawLimit) ? rawLimit : 25;
      const query = typeof req.query.q === "string" ? req.query.q : "";
      const messages = await listSupportMailboxMessages({ folder, limit, query });
      res.json({
        ...getSupportMailboxStatus(),
        messages,
      });
    } catch (error) {
      console.error("Error fetching support mailbox messages:", error);
      res.status(500).json({ error: "Failed to fetch support mailbox messages" });
    }
  });

  app.get("/api/admin/support-email/messages/:uid", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const uid = Number.parseInt(req.params.uid, 10);
      if (!Number.isFinite(uid) || uid <= 0) {
        return res.status(400).json({ error: "A valid message id is required" });
      }

      const folder: SupportMailboxFolder =
        req.query.folder === "sent" ||
        req.query.folder === "archive" ||
        req.query.folder === "trash"
          ? req.query.folder
          : "inbox";
      const markRead = req.query.markRead === "true" || req.query.markRead === "1";
      const message = await getSupportMailboxMessage({ folder, uid, markRead });
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      res.json({
        ...getSupportMailboxStatus(),
        message,
      });
    } catch (error) {
      console.error("Error fetching support mailbox message:", error);
      res.status(500).json({ error: "Failed to fetch support mailbox message" });
    }
  });

  app.get(
    "/api/admin/support-email/messages/:uid/conversation",
    isAuthenticated,
    requireAdmin,
    async (req: any, res: Response) => {
      try {
        const uid = Number.parseInt(req.params.uid, 10);
        if (!Number.isFinite(uid) || uid <= 0) {
          return res.status(400).json({ error: "A valid message id is required" });
        }

        const folder: SupportMailboxFolder =
          req.query.folder === "sent" ||
          req.query.folder === "archive" ||
          req.query.folder === "trash"
            ? req.query.folder
            : "inbox";

        const messages = await getSupportMailboxConversation({ folder, uid, limit: 50 });
        res.json({
          ...getSupportMailboxStatus(),
          messages,
        });
      } catch (error) {
        console.error("Error fetching support mailbox conversation:", error);
        res.status(500).json({ error: "Failed to fetch support mailbox conversation" });
      }
    },
  );

  app.get(
    "/api/admin/support-email/messages/:uid/attachments/:index",
    isAuthenticated,
    requireAdmin,
    async (req: any, res: Response) => {
      try {
        const uid = Number.parseInt(req.params.uid, 10);
        const index = Number.parseInt(req.params.index, 10);
        if (!Number.isFinite(uid) || uid <= 0 || !Number.isFinite(index) || index < 0) {
          return res.status(400).json({ error: "A valid attachment is required" });
        }

        const folder: SupportMailboxFolder =
          req.query.folder === "sent" ||
          req.query.folder === "archive" ||
          req.query.folder === "trash"
            ? req.query.folder
            : "inbox";

        const attachment = await downloadSupportMailboxAttachment({ folder, uid, index });
        if (!attachment) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        res.setHeader("Content-Type", attachment.contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${attachment.filename.replace(/"/g, "")}"`,
        );
        res.send(attachment.content);
      } catch (error) {
        console.error("Error downloading support mailbox attachment:", error);
        res.status(500).json({ error: "Failed to download attachment" });
      }
    },
  );

  app.post(
    "/api/admin/support-email/messages/:uid/move",
    isAuthenticated,
    requireAdmin,
    async (req: any, res: Response) => {
      try {
        const uid = Number.parseInt(req.params.uid, 10);
        if (!Number.isFinite(uid) || uid <= 0) {
          return res.status(400).json({ error: "A valid message id is required" });
        }

        const folder: SupportMailboxFolder =
          req.query.folder === "sent" ||
          req.query.folder === "archive" ||
          req.query.folder === "trash"
            ? req.query.folder
            : "inbox";

        const parsed = moveSupportEmailMessageSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid move request" });
        }

        if (folder === parsed.data.destination) {
          return res.json({ success: true, moved: false });
        }

        const moved = await moveSupportMailboxMessage({
          folder,
          uid,
          destination: parsed.data.destination,
        });

        res.json({ success: true, moved });
      } catch (error) {
        console.error("Error moving support mailbox message:", error);
        res.status(500).json({ error: "Failed to move support mailbox message" });
      }
    },
  );

  app.post("/api/admin/support-email/send", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const parsed = sendSupportEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid email" });
      }

      await sendSupportMailboxMessage(parsed.data);
      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Error sending support mailbox message:", error);
      res.status(500).json({ error: "Failed to send support email" });
    }
  });

  app.get("/api/admin/live-connections", isAuthenticated, requireAdmin, async (_req: any, res: Response) => {
    try {
      const roomInfo = getRoomInfo();
      const uniqueNoteIds = Array.from(new Set(roomInfo.map((room) => room.noteId)));
      const uniqueUserIds = Array.from(
        new Set(
          roomInfo.flatMap((room) =>
            room.editors.map((editor: { userId: string }) => editor.userId),
          ),
        ),
      );

      const [notesById, usersById] = await Promise.all([
        Promise.all(uniqueNoteIds.map(async (noteId) => [noteId, await storage.getNote(noteId)] as const)),
        Promise.all(uniqueUserIds.map(async (userId) => [userId, await storage.getUserById(userId)] as const)),
      ]);

      const noteMap = new Map(notesById);
      const userMap = new Map(usersById);

      const rooms = roomInfo
        .map((room) => {
          const note = noteMap.get(room.noteId);
          type LiveConnectionEditor = {
            userId: string;
            userName: string;
            email: string | null;
            lastActivity: string;
          };
          const editors = room.editors
            .map((editor: { userId: string; userName: string; lastActivity: number }) => {
              const user = userMap.get(editor.userId);
              const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
              return {
                userId: editor.userId,
                userName: fullName || user?.email || editor.userName || editor.userId,
                email: user?.email || null,
                lastActivity: new Date(editor.lastActivity).toISOString(),
              };
            })
            .sort((a: LiveConnectionEditor, b: LiveConnectionEditor) =>
              b.lastActivity.localeCompare(a.lastActivity),
            );

          const lastActivity =
            editors[0]?.lastActivity ||
            new Date(0).toISOString();

          return {
            noteId: room.noteId,
            noteTitle: note?.title || `Note ${room.noteId}`,
            patientName: note?.patientName || null,
            editorCount: room.editorCount,
            version: room.version,
            lastActivity,
            editors,
          };
        })
        .sort((a, b) => {
          if (b.editorCount !== a.editorCount) return b.editorCount - a.editorCount;
          return b.lastActivity.localeCompare(a.lastActivity);
        });

      res.json({
        generatedAt: new Date().toISOString(),
        totalRooms: rooms.length,
        totalConnections: rooms.reduce((sum, room) => sum + room.editorCount, 0),
        rooms,
      });
    } catch (error) {
      console.error("Error fetching live admin connections:", error);
      res.status(500).json({ error: "Failed to fetch live connections" });
    }
  });

  app.get("/api/admin/ai-settings", isAuthenticated, requireAdmin, async (_req: any, res: Response) => {
    try {
      const [settings, generationSettings, personalKeyStatus] = await Promise.all([
        getAiProviderPreference(),
        getAiGenerationSettings(),
        getSavedPersonalAiKeyStatus(),
      ]);
      res.json({
        ...settings,
        ...generationSettings,
        ...personalKeyStatus,
        personalKeySource: getPersonalKeySource(),
      });
    } catch (error) {
      console.error("Error fetching admin AI settings:", error);
      res.status(500).json({ error: "Failed to fetch AI settings" });
    }
  });

  app.put("/api/admin/ai-settings", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const parsed = updateAdminAiSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid AI settings payload" });
      }

      const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      const normalizedIp = typeof ipAddress === "string" ? ipAddress : ipAddress?.[0];
      const [providerSettings, generationSettings] = await Promise.all([
        updateAiProviderPreference({
          preferredSource: parsed.data.preferredSource as AiProviderSource,
          userId: req.user.claims.sub,
          userEmail: req.user.claims.email,
          ipAddress: normalizedIp,
          userAgent: req.headers["user-agent"],
        }),
        updateAiGenerationSettings({
          textModel: parsed.data.textModel as AdminAiTextModel,
          monthlyBudgetUsd: parsed.data.monthlyBudgetUsd,
          userId: req.user.claims.sub,
          userEmail: req.user.claims.email,
          ipAddress: normalizedIp,
          userAgent: req.headers["user-agent"],
        }),
      ]);

      res.json({
        ...providerSettings,
        ...generationSettings,
      });
    } catch (error) {
      console.error("Error updating admin AI settings:", error);
      res.status(500).json({ error: "Failed to update AI settings" });
    }
  });

  app.put("/api/admin/ai-settings/personal-key", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const parsed = saveAdminPersonalAiKeySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid personal OpenAI key payload" });
      }

      const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      const updated = await savePersonalAiKey({
        apiKey: parsed.data.personalApiKey,
        userId: req.user.claims.sub,
        userEmail: req.user.claims.email,
        ipAddress: typeof ipAddress === "string" ? ipAddress : ipAddress?.[0],
        userAgent: req.headers["user-agent"],
      });
      res.json({
        ...updated,
        personalKeySource: getPersonalKeySource(),
      });
    } catch (error) {
      console.error("Error saving personal OpenAI key:", error);
      res.status(500).json({ error: "Failed to save personal OpenAI key" });
    }
  });

  app.delete("/api/admin/ai-settings/personal-key", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const ipAddress = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      const updated = await clearSavedPersonalAiKey({
        userId: req.user.claims.sub,
        userEmail: req.user.claims.email,
        ipAddress: typeof ipAddress === "string" ? ipAddress : ipAddress?.[0],
        userAgent: req.headers["user-agent"],
      });
      res.json({
        ...updated,
        personalKeySource: getPersonalKeySource(),
      });
    } catch (error) {
      console.error("Error clearing personal OpenAI key:", error);
      res.status(500).json({ error: "Failed to clear personal OpenAI key" });
    }
  });

  app.get("/api/admin/ai-usage", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const requestedHours = typeof req.query.hours === "string" ? Number.parseInt(req.query.hours, 10) : Number.NaN;
      const windowHours = Number.isFinite(requestedHours)
        ? Math.min(Math.max(requestedHours, 1), 24 * 30)
        : 24;
      const startDate = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const [logs, monthLogs, generationSettings, openAiCosts, monthOpenAiCosts] = await Promise.all([
        storage.getAuditLogs({ resourceType: "ai_usage", startDate, limit: 100000 }),
        storage.getAuditLogs({ resourceType: "ai_usage", startDate: monthStart, limit: 100000 }),
        getAiGenerationSettings(),
        fetchOpenAiCostSummary({ startDate }),
        fetchOpenAiCostSummary({ startDate: monthStart }),
      ]);

      type Provider = "personal" | "replit";
      type ProviderStats = { requests: number; errors: number; totalTokens: number };
      type OperationStats = { requests: number; errors: number; totalTokens: number };
      const byProvider: Record<Provider, ProviderStats> = {
        personal: { requests: 0, errors: 0, totalTokens: 0 },
        replit: { requests: 0, errors: 0, totalTokens: 0 },
      };
      const byOperation: Record<string, OperationStats> = {};
      const byModel: Record<string, number> = {};
      const estimatedCostByModel: Record<string, number> = {};
      let totalRequests = 0;
      let totalErrors = 0;
      let totalTokens = 0;
      let estimatedCostUsd = 0;
      let estimatedMonthToDateCostUsd = 0;

      const getEstimatedLogCostUsd = (log: AuditLog) => {
        try {
          const details = log.details ? JSON.parse(log.details) : {};
          const model = typeof details?.model === "string" ? details.model : null;
          const inputTokens =
            typeof details?.usage?.inputTokens === "number"
              ? details.usage.inputTokens
              : typeof details?.usage?.input_tokens === "number"
                ? details.usage.input_tokens
                : typeof details?.usage?.prompt_tokens === "number"
                  ? details.usage.prompt_tokens
                  : 0;
          const outputTokens =
            typeof details?.usage?.outputTokens === "number"
              ? details.usage.outputTokens
              : typeof details?.usage?.output_tokens === "number"
                ? details.usage.output_tokens
                : typeof details?.usage?.completion_tokens === "number"
                  ? details.usage.completion_tokens
                  : 0;

          return estimateModelCostUsd({
            model,
            inputTokens,
            outputTokens,
          });
        } catch {
          return null;
        }
      };

      for (const log of monthLogs) {
        const estimated = getEstimatedLogCostUsd(log);
        if (typeof estimated === "number") {
          estimatedMonthToDateCostUsd += estimated;
        }
      }

      const recent = logs
        .slice(0, 100)
        .map((log) => {
          try {
            const details = log.details ? JSON.parse(log.details) : {};
            const provider: Provider =
              details?.provider === "personal" || details?.provider === "replit"
                ? details.provider
                : "replit";
            const operation = typeof details?.operation === "string" ? details.operation : "unknown";
            const model = typeof details?.model === "string" ? details.model : null;
            const success = details?.success !== false;
            const inputTokens =
              typeof details?.usage?.inputTokens === "number"
                ? details.usage.inputTokens
                : typeof details?.usage?.input_tokens === "number"
                  ? details.usage.input_tokens
                  : typeof details?.usage?.prompt_tokens === "number"
                    ? details.usage.prompt_tokens
                    : 0;
            const outputTokens =
              typeof details?.usage?.outputTokens === "number"
                ? details.usage.outputTokens
                : typeof details?.usage?.output_tokens === "number"
                  ? details.usage.output_tokens
                  : typeof details?.usage?.completion_tokens === "number"
                    ? details.usage.completion_tokens
                    : 0;
            const eventTokens =
              typeof details?.usage?.totalTokens === "number"
                ? details.usage.totalTokens
                : typeof details?.usage?.total_tokens === "number"
                  ? details.usage.total_tokens
                  : 0;
            const estimatedEventCostUsd = estimateModelCostUsd({
              model,
              inputTokens,
              outputTokens,
            });

            totalRequests += 1;
            if (!success) totalErrors += 1;
            totalTokens += eventTokens;
            if (typeof estimatedEventCostUsd === "number") {
              estimatedCostUsd += estimatedEventCostUsd;
              if (model) {
                estimatedCostByModel[model] = (estimatedCostByModel[model] || 0) + estimatedEventCostUsd;
              }
            }

            if (!byOperation[operation]) {
              byOperation[operation] = { requests: 0, errors: 0, totalTokens: 0 };
            }

            byProvider[provider].requests += 1;
            byProvider[provider].totalTokens += eventTokens;
            byOperation[operation].requests += 1;
            byOperation[operation].totalTokens += eventTokens;

            if (!success) {
              byProvider[provider].errors += 1;
              byOperation[operation].errors += 1;
            }

            if (model) {
              byModel[model] = (byModel[model] || 0) + 1;
            }

            return {
              id: log.id,
              createdAt: log.timestamp,
              provider,
              operation,
              model,
              success,
              totalTokens: eventTokens,
              estimatedCostUsd: estimatedEventCostUsd,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      const topModels = Object.entries(byModel)
        .map(([model, requests]) => ({ model, requests }))
        .sort((a, b) => b.requests - a.requests)
        .slice(0, 10);

      const estimatedCostByModelList = Object.entries(estimatedCostByModel)
        .map(([model, usd]) => ({
          model,
          usd,
        }))
        .sort((a, b) => b.usd - a.usd);

      const currentSpendUsd =
        openAiCosts.available && typeof openAiCosts.totalUsd === "number"
          ? openAiCosts.totalUsd
          : estimatedCostUsd;
      const monthToDateSpendUsd =
        monthOpenAiCosts.available && typeof monthOpenAiCosts.totalUsd === "number"
          ? monthOpenAiCosts.totalUsd
          : estimatedMonthToDateCostUsd;
      const remainingBudgetUsd =
        generationSettings.monthlyBudgetUsd != null
          ? Math.max(0, generationSettings.monthlyBudgetUsd - monthToDateSpendUsd)
          : null;

      res.json({
        windowHours,
        totalRequests,
        totalErrors,
        errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
        totalTokens,
        estimatedCostUsd,
        estimatedCostByModel: estimatedCostByModelList,
        openAiCosts,
        monthlyBudgetUsd: generationSettings.monthlyBudgetUsd,
        remainingBudgetUsd,
        currentSpendUsd,
        monthToDateSpendUsd,
        monthToDateSpendSource: monthOpenAiCosts.available ? "actual" : "estimated",
        monthOpenAiCosts,
        spendSource: openAiCosts.available ? "actual" : "estimated",
        byProvider,
        byOperation,
        topModels,
        recent,
      });
    } catch (error) {
      console.error("Error fetching AI usage summary:", error);
      res.status(500).json({ error: "Failed to fetch AI usage summary" });
    }
  });

  app.get("/api/admin/customer-usage", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const requestedHours = typeof req.query.hours === "string" ? Number.parseInt(req.query.hours, 10) : Number.NaN;
      const requestedLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
      const includeInactive = req.query.includeInactive === "true";
      const windowHours = Number.isFinite(requestedHours)
        ? Math.min(Math.max(requestedHours, 1), 24 * 30)
        : 24;
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 500)
        : 200;

      const startDate = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      const [usageLogs, allUsers] = await Promise.all([
        storage.getAuditLogs({ resourceType: "ai_usage", startDate, limit: 100000 }),
        storage.getAllUsers(),
      ]);

      const userDirectory = new Map(
        allUsers.map((user) => [user.id, user]),
      );

      type Provider = "personal" | "replit";
      type UserUsage = {
        userId: string;
        displayName: string;
        email: string | null;
        requests: number;
        errors: number;
        totalTokens: number;
        byProvider: Record<Provider, number>;
        byOperation: Record<string, number>;
        lastActivityAt: string | null;
      };

      const byUser = new Map<string, UserUsage>();
      let unattributedRequests = 0;
      let unattributedTokens = 0;

      const getDisplayName = (userId: string) => {
        const user = userDirectory.get(userId);
        if (!user) return userId;
        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        if (fullName) return fullName;
        if (user.email) return user.email;
        return user.id;
      };

      for (const log of usageLogs) {
        const userId = log.userId || "";
        let details: any = {};
        try {
          details = log.details ? JSON.parse(log.details) : {};
        } catch {
          details = {};
        }

        const eventTokens =
          typeof details?.usage?.totalTokens === "number"
            ? details.usage.totalTokens
            : typeof details?.usage?.total_tokens === "number"
              ? details.usage.total_tokens
              : 0;

        if (!userId || userId === "ai_system") {
          unattributedRequests += 1;
          unattributedTokens += eventTokens;
          continue;
        }

        const provider: Provider =
          details?.provider === "personal" || details?.provider === "replit"
            ? details.provider
            : "replit";
        const operation = typeof details?.operation === "string" ? details.operation : "unknown";
        const success = details?.success !== false;

        if (!byUser.has(userId)) {
          byUser.set(userId, {
            userId,
            displayName: getDisplayName(userId),
            email: userDirectory.get(userId)?.email || null,
            requests: 0,
            errors: 0,
            totalTokens: 0,
            byProvider: { personal: 0, replit: 0 },
            byOperation: {},
            lastActivityAt: null,
          });
        }

        const usage = byUser.get(userId)!;
        usage.requests += 1;
        usage.totalTokens += eventTokens;
        usage.byProvider[provider] += 1;
        usage.byOperation[operation] = (usage.byOperation[operation] || 0) + 1;
        usage.lastActivityAt = log.timestamp?.toISOString?.() || new Date(log.timestamp).toISOString();
        if (!success) usage.errors += 1;
      }

      if (includeInactive) {
        for (const user of allUsers) {
          if (byUser.has(user.id)) continue;
          byUser.set(user.id, {
            userId: user.id,
            displayName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || user.id,
            email: user.email || null,
            requests: 0,
            errors: 0,
            totalTokens: 0,
            byProvider: { personal: 0, replit: 0 },
            byOperation: {},
            lastActivityAt: null,
          });
        }
      }

      const totals = Array.from(byUser.values()).reduce(
        (acc, row) => {
          acc.requests += row.requests;
          acc.errors += row.errors;
          acc.totalTokens += row.totalTokens;
          return acc;
        },
        { requests: 0, errors: 0, totalTokens: 0 },
      );

      const users = Array.from(byUser.values())
        .sort((a, b) => {
          if (b.requests !== a.requests) return b.requests - a.requests;
          if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
          return a.displayName.localeCompare(b.displayName);
        })
        .slice(0, limit)
        .map((row) => ({
          ...row,
          errorRate: row.requests > 0 ? row.errors / row.requests : 0,
          requestShare: totals.requests > 0 ? row.requests / totals.requests : 0,
          tokenShare: totals.totalTokens > 0 ? row.totalTokens / totals.totalTokens : 0,
        }));

      res.json({
        generatedAt: new Date().toISOString(),
        windowHours,
        includeInactive,
        totals: {
          activeCustomers: Array.from(byUser.values()).filter((row) => row.requests > 0).length,
          listedCustomers: users.length,
          requests: totals.requests,
          errors: totals.errors,
          errorRate: totals.requests > 0 ? totals.errors / totals.requests : 0,
          totalTokens: totals.totalTokens,
        },
        unattributed: {
          requests: unattributedRequests,
          totalTokens: unattributedTokens,
        },
        users,
      });
    } catch (error) {
      console.error("Error fetching customer usage summary:", error);
      res.status(500).json({ error: "Failed to fetch customer usage summary" });
    }
  });

  app.get("/api/admin/api-usage", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const requestedHours = typeof req.query.hours === "string" ? Number.parseInt(req.query.hours, 10) : Number.NaN;
      const requestedLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;

      const usageSummary = getApiUsageSummary({
        windowHours: Number.isFinite(requestedHours) ? requestedHours : 24,
        limit: Number.isFinite(requestedLimit) ? requestedLimit : 20,
      });

      res.json(usageSummary);
    } catch (error) {
      console.error("Error fetching API usage summary:", error);
      res.status(500).json({ error: "Failed to fetch API usage summary" });
    }
  });

  app.get("/api/admin/transcription-metrics", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const requestedHours = typeof req.query.hours === "string" ? Number.parseInt(req.query.hours, 10) : Number.NaN;
      const requestedLimit = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : Number.NaN;
      const windowHours = Number.isFinite(requestedHours)
        ? Math.min(Math.max(requestedHours, 1), 24 * 30)
        : 24;
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 100), 5000)
        : 2000;

      const startDate = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      const metrics = await storage.getTranscriptionMetrics({ startDate, limit });

      type Bucket = {
        requests: number;
        successes: number;
        errors: number;
        fallbacks: number;
        latencies: number[];
      };

      const createBucket = (): Bucket => ({
        requests: 0,
        successes: 0,
        errors: 0,
        fallbacks: 0,
        latencies: [],
      });

      const totals = createBucket();
      const byProvider: Record<"local" | "openai" | "unknown", Bucket> = {
        local: createBucket(),
        openai: createBucket(),
        unknown: createBucket(),
      };
      const byChannel: Record<"web" | "mobile" | "unknown", Bucket> = {
        web: createBucket(),
        mobile: createBucket(),
        unknown: createBucket(),
      };

      const configuredProviders: Record<string, number> = {};
      const errorTypes: Record<string, number> = {};

      for (const row of metrics) {
        const provider: "local" | "openai" | "unknown" =
          row.provider === "local" || row.provider === "openai" ? row.provider : "unknown";
        const channel: "web" | "mobile" | "unknown" =
          row.channel === "web" || row.channel === "mobile" ? row.channel : "unknown";
        const event = row.eventType;
        const latency = typeof row.latencyMs === "number" ? row.latencyMs : null;

        if (row.configuredProvider) {
          configuredProviders[row.configuredProvider] = (configuredProviders[row.configuredProvider] || 0) + 1;
        }

        if (event === "request") {
          totals.requests += 1;
          byProvider[provider].requests += 1;
          byChannel[channel].requests += 1;
        } else if (event === "success") {
          totals.successes += 1;
          byProvider[provider].successes += 1;
          byChannel[channel].successes += 1;
        } else if (event === "error") {
          totals.errors += 1;
          byProvider[provider].errors += 1;
          byChannel[channel].errors += 1;
          const errorType = row.errorType || "unknown";
          errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
        } else if (event === "fallback") {
          totals.fallbacks += 1;
          byProvider[provider].fallbacks += 1;
          byChannel[channel].fallbacks += 1;
        }

        if ((event === "success" || event === "error") && latency !== null && Number.isFinite(latency)) {
          totals.latencies.push(latency);
          byProvider[provider].latencies.push(latency);
          byChannel[channel].latencies.push(latency);
        }
      }

      const finalizeBucket = (bucket: Bucket) => ({
        requests: bucket.requests,
        successes: bucket.successes,
        errors: bucket.errors,
        fallbacks: bucket.fallbacks,
        errorRate: bucket.requests > 0 ? bucket.errors / bucket.requests : 0,
        fallbackRate: bucket.requests > 0 ? bucket.fallbacks / bucket.requests : 0,
        avgLatencyMs:
          bucket.latencies.length > 0
            ? Math.round(bucket.latencies.reduce((sum, value) => sum + value, 0) / bucket.latencies.length)
            : 0,
        p95LatencyMs: Math.round(percentile(bucket.latencies, 95)),
      });

      const recent = metrics.slice(0, 50).map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        channel: row.channel || "unknown",
        eventType: row.eventType,
        provider: row.provider || "unknown",
        configuredProvider: row.configuredProvider || null,
        fallbackProvider: row.fallbackProvider || null,
        fallbackUsed: row.fallbackUsed,
        errorType: row.errorType || null,
        statusCode: row.statusCode || null,
        latencyMs: row.latencyMs || null,
        chunkId: row.chunkId || null,
      }));

      res.json({
        generatedAt: new Date().toISOString(),
        windowHours,
        eventsCaptured: metrics.length,
        totals: finalizeBucket(totals),
        byProvider: {
          local: finalizeBucket(byProvider.local),
          openai: finalizeBucket(byProvider.openai),
          unknown: finalizeBucket(byProvider.unknown),
        },
        byChannel: {
          web: finalizeBucket(byChannel.web),
          mobile: finalizeBucket(byChannel.mobile),
          unknown: finalizeBucket(byChannel.unknown),
        },
        configuredProviders,
        errorTypes,
        recent,
      });
    } catch (error) {
      console.error("Error fetching transcription metrics:", error);
      res.status(500).json({ error: "Failed to fetch transcription metrics" });
    }
  });

  // Get internal inbox submissions (admin only)
  app.get("/api/admin/internal-messages/unread-count", isAuthenticated, requireAdmin, async (_req: any, res: Response) => {
    try {
      const logs = await storage.getAuditLogs({ resourceType: "internal_message" });
      const unreadCount = logs.reduce((count, log) => {
        const details = parseInternalMessageLogDetails(log);
        if (details.deletedAt) return count;
        return details.readAt ? count : count + 1;
      }, 0);

      res.json({ unreadCount });
    } catch (error) {
      console.error("Error fetching internal message unread count:", error);
      res.status(500).json({ error: "Failed to fetch internal message unread count" });
    }
  });

  app.get("/api/admin/internal-messages", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const logs = await storage.getAuditLogs({ resourceType: "internal_message" });
      const messages = logs
        .map((log) => {
          const details = parseInternalMessageLogDetails(log);
          if (details.deletedAt) return null;
          return {
            id: log.id,
            userId: log.userId,
            userEmail: log.userEmail,
            subject: details.subject,
            message: details.message,
            category: details.category,
            createdAt: log.timestamp,
            isRead: !!details.readAt,
            readAt: details.readAt,
          };
        })
        .filter(Boolean);

      res.json(messages);
    } catch (error) {
      console.error("Error fetching internal messages:", error);
      res.status(500).json({ error: "Failed to fetch internal messages" });
    }
  });

  app.patch("/api/admin/internal-messages/read", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const parsed = updateMessageSelectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const adminUserId = req.user.claims.sub;
      const logs = await storage.getAuditLogsByIds(parsed.data.messageIds);
      const targetLogs = logs.filter((log) => {
        if (log.resourceType !== "internal_message") return false;
        const details = parseInternalMessageLogDetails(log);
        return !details.readAt && !details.deletedAt;
      });

      const readAt = new Date().toISOString();
      await Promise.all(
        targetLogs.map((log) => {
          const details = parseInternalMessageLogDetails(log);
          return storage.updateAuditLog(log.id, {
            details: serializeInternalMessageLogDetails({
              ...details,
              readAt,
              readByAdminId: adminUserId,
            }),
          });
        }),
      );

      res.json({ updated: targetLogs.length });
    } catch (error) {
      console.error("Error marking internal messages as read:", error);
      res.status(500).json({ error: "Failed to mark internal messages as read" });
    }
  });

  app.delete("/api/admin/internal-messages", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const parsed = updateMessageSelectionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });
      }

      const adminUserId = req.user.claims.sub;
      const deletedAt = new Date().toISOString();
      const logs = await storage.getAuditLogsByIds(parsed.data.messageIds);
      const targetLogs = logs.filter((log) => {
        if (log.resourceType !== "internal_message") return false;
        const details = parseInternalMessageLogDetails(log);
        return !details.deletedAt;
      });

      await Promise.all(
        targetLogs.map((log) => {
          const details = parseInternalMessageLogDetails(log);
          return storage.updateAuditLog(log.id, {
            details: serializeInternalMessageLogDetails({
              ...details,
              deletedAt,
              deletedByAdminId: adminUserId,
            }),
          });
        }),
      );

      res.json({ updated: targetLogs.length });
    } catch (error) {
      console.error("Error deleting internal messages:", error);
      res.status(500).json({ error: "Failed to delete internal messages" });
    }
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

  // Get all users with subscription status (admin only)
  app.get("/api/admin/users", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      // Get all users from the users table (everyone who has logged in)
      const allUsers = await storage.getAllUsers();
      // Get settings for users who have saved them
      const allSettings = await storage.getAllUserSettings();
      const allSubscriptions = await storage.getAllSubscriptions();
      
      // Create maps for quick lookup
      const settingsMap = new Map(allSettings.map(s => [s.userId, s]));
      const subscriptionMap = new Map(allSubscriptions.map(s => [s.userId, s]));
      
      // Merge users with their settings and subscriptions
      const enrichedUsers = allUsers.map(user => {
        const settings = settingsMap.get(user.id);
        const isSuperAdminUser = isOwnerEmail(user.email);
        return {
          // Base user data from users table
          id: settings?.id || 0, // Use settings id if available, 0 for unsaved
          odexId: user.id, // Keep the original user id
          userId: user.id,
          email: user.email,
          isAdmin: isSuperAdminUser || user.isAdmin,
          isSuperAdmin: isSuperAdminUser,
          // Use settings data if available, otherwise use users table data
          firstName: settings?.firstName || user.firstName || null,
          lastName: settings?.lastName || user.lastName || null,
          preferredName: settings?.preferredName || null,
          specialty: settings?.specialty || null,
          practiceName: settings?.practiceName || null,
          credentials: settings?.credentials || null,
          createdAt: settings?.createdAt || user.createdAt,
          // Subscription data
          subscription: subscriptionMap.get(user.id) || null,
        };
      });
      
      res.json(enrichedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.put("/api/admin/users/:userId/admin", isAuthenticated, requireSuperAdmin, async (req: any, res: Response) => {
    try {
      const { userId } = req.params;
      const parsed = z.object({ isAdmin: z.boolean() }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "isAdmin must be a boolean" });
      }

      const existingUser = await storage.getUserById(userId);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (isOwnerEmail(existingUser.email)) {
        return res.status(400).json({ error: "The super admin role is managed by OWNER_EMAIL and cannot be changed here." });
      }

      const updatedUser = await storage.setUserAdminStatus(userId, parsed.data.isAdmin);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        userId: updatedUser.id,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        isSuperAdmin: false,
      });
    } catch (error) {
      console.error("Error updating admin status:", error);
      res.status(500).json({ error: "Failed to update admin status" });
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
        case "days_60":
          newPeriodEnd = new Date(baseDate.getTime() + 60 * 24 * 60 * 60 * 1000);
          break;
        case "days_90":
          newPeriodEnd = new Date(baseDate.getTime() + 90 * 24 * 60 * 60 * 1000);
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
      const configuredBaseUrl = process.env.APP_BASE_URL?.trim();
      const replitDevBaseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "";
      const replitPrimaryBaseUrl = process.env.REPLIT_DOMAINS?.split(",")[0]
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "";
      const baseUrl = (configuredBaseUrl || replitDevBaseUrl || replitPrimaryBaseUrl || "https://docuwhisper.com")
        .replace(/\/+$/, "");
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

  // Admin: Update user settings (EMR role, access, profile fields, etc.)
  app.put("/api/admin/users/:userId/settings", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { userId } = req.params;
      const { 
        emrRole, requiresCosignature, supervisingPhysicianId, hasEmrAccess,
        firstName, lastName, preferredName, specialty, practiceName, credentials
      } = req.body;
      
      // Build settings object for upsert
      const settingsData: any = { userId };
      if (emrRole !== undefined) settingsData.emrRole = emrRole;
      if (requiresCosignature !== undefined) settingsData.requiresCosignature = requiresCosignature;
      if (supervisingPhysicianId !== undefined) settingsData.supervisingPhysicianId = supervisingPhysicianId;
      // Profile fields
      if (firstName !== undefined) settingsData.firstName = firstName;
      if (lastName !== undefined) settingsData.lastName = lastName;
      if (preferredName !== undefined) settingsData.preferredName = preferredName;
      if (specialty !== undefined) settingsData.specialty = specialty;
      if (practiceName !== undefined) settingsData.practiceName = practiceName;
      if (credentials !== undefined) settingsData.credentials = credentials;
      
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
        settings: settings || null,
        subscription: subscription || null,
      });
    } catch (error) {
      console.error("Error getting user details:", error);
      res.status(500).json({ error: "Failed to get user details" });
    }
  });

  app.delete("/api/admin/users/:userId", isAuthenticated, requireAdmin, async (req: any, res: Response) => {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.claims?.sub;
      
      if (userId === currentUserId) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      await storage.deleteUserAndData(userId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Failed to delete user:", error);
      res.status(500).json({ error: "Failed to delete user" });
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
      const fromDate = req.query.from ? new Date(req.query.from as string) : undefined;
      const toDate = req.query.to ? new Date(req.query.to as string) : undefined;
      
      const analytics = await storage.getAnalytics(userId, fromDate, toDate);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ error: "Failed to fetch analytics" });
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
      
      if (!(await hasSuperAdminFeatureAccess(req))) {
        return res.status(403).json({ error: "Only the super admin can create practices" });
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
      if (!(await hasAdminFeatureAccess(req))) {
        return res.status(403).json({ error: "Admin access required for EMR features" });
      }
      const userId = req.user.claims.sub;

      if (await hasAdminFeatureAccess(req)) {
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
      const adminAccess = await getAdminAccessContext(req);
      if (!adminAccess.isAdmin) {
        return res.status(403).json({ error: "Admin access required for EMR features" });
      }
      const practiceId = parseInt(req.params.id);
      const currentUserId = req.user.claims.sub;
      const { userId, emrRole = "provider" } = req.body;

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
      const isVendorOwner = adminAccess.isAdmin;
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
      const adminAccess = await getAdminAccessContext(req);
      if (!adminAccess.isAdmin) {
        return res.status(403).json({ error: "Admin access required for EMR features" });
      }
      const practiceId = parseInt(req.params.id);
      const targetUserId = req.params.userId;
      const currentUserId = req.user.claims.sub;

      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }

      // Check authorization
      const isVendorOwner = adminAccess.isAdmin;
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
      const adminAccess = await getAdminAccessContext(req);
      if (!adminAccess.isAdmin) {
        return res.status(403).json({ error: "Admin access required for EMR features" });
      }
      const practiceId = parseInt(req.params.id);
      const targetUserId = req.params.userId;
      const currentUserId = req.user.claims.sub;
      const { emrRole } = req.body;

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
      const isVendorOwner = adminAccess.isAdmin;
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
      const adminAccess = await getAdminAccessContext(req);
      if (!adminAccess.isAdmin) {
        return res.status(403).json({ error: "Admin access required for EMR features" });
      }
      const practiceId = parseInt(req.params.id);
      const currentUserId = req.user.claims.sub;

      const practice = await storage.getPractice(practiceId);
      if (!practice) {
        return res.status(404).json({ error: "Practice not found" });
      }

      // Check if user has access (owner, member of org, or vendor owner)
      const isVendorOwner = adminAccess.isAdmin;
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
      const fromDate = req.query.from ? new Date(req.query.from as string) : undefined;
      
      const trends = await storage.getProductivityTrends(userId, Math.min(days, 366), fromDate);
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
      const fromDate = req.query.from ? new Date(req.query.from as string) : undefined;
      const toDate = req.query.to ? new Date(req.query.to as string) : undefined;
      
      const diagnoses = await storage.getTrendingDiagnoses(userId, fromDate, toDate);
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
      const adminAccess = await getAdminAccessContext(req);
      const isVendorOwner = adminAccess.isAdmin;
      
      const subscription = await storage.getSubscription(userId);
      const settings = await storage.getUserSettings(userId);
      let organizations: { practice: any; emrRole: string | null }[] = [];
      if (isVendorOwner) {
        const allOrgs = await storage.getAllOrganizationsWithEmr();
        organizations = allOrgs.map(org => ({ practice: org, emrRole: 'vendor' as string | null }));
      }
      
      res.json({
        hasAccess: isVendorOwner,
        isVendorOwner,
        subscriptionStatus: subscription?.status || "none",
        consentAcknowledged: settings?.emrConsentAcknowledged || false,
        consentDate: settings?.emrConsentDate,
        organizations, // List of orgs user has EMR access to
        accessType: isVendorOwner ? 'vendor' : 'none',
      });
    } catch (error) {
      console.error("Error checking EMR access:", error);
      res.status(500).json({ error: "Failed to check EMR access" });
    }
  });

  // Acknowledge EMR/PHI consent (HIPAA requirement)
  app.post("/api/emr/consent", isAuthenticated, async (req: any, res: Response) => {
    try {
      const adminAccess = await getAdminAccessContext(req);
      if (!adminAccess.isAdmin) {
        return res.status(403).json({ error: "Admin access required for EMR features" });
      }
      const userId = req.user.claims.sub;
      const subscription = await storage.getSubscription(userId);
      const emrOrgs = await storage.getUserEmrOrganizations(userId);
      
      const isVendorOwner = adminAccess.isAdmin;
      const hasIndividualAccess = subscription?.hasEmrAccess === true && subscription?.status === "active";
      const hasOrgAccess = emrOrgs.length > 0;
      
      if (!isVendorOwner && !hasIndividualAccess && !hasOrgAccess) {
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
      const seenWithinDaysRaw = req.query.seenWithinDays as string | undefined;
      const seenWithinDays = seenWithinDaysRaw ? parseInt(seenWithinDaysRaw, 10) : NaN;
      const sinceDate = Number.isFinite(seenWithinDays) && seenWithinDays > 0
        ? new Date(Date.now() - seenWithinDays * 24 * 60 * 60 * 1000)
        : null;
      
      // Check if user is owner (vendor)
      const isVendor = await hasAdminFeatureAccess(req);
      
      if (isVendor && organizationId) {
        // Vendor can access any organization's patients
        const patients = sinceDate
          ? await storage.getRecentlySeenPatientsByOrganization(organizationId, sinceDate)
          : await storage.getPatientsByOrganization(organizationId);
        res.json(patients);
      } else if (organizationId) {
        // Check if user has access to this organization
        const members = await storage.getPracticeMembers(organizationId);
        const isMember = members.some((m: { userId: string }) => m.userId === userId);
        if (isMember) {
          const patients = sinceDate
            ? await storage.getRecentlySeenPatientsByOrganization(organizationId, sinceDate)
            : await storage.getPatientsByOrganization(organizationId);
          res.json(patients);
        } else {
          res.status(403).json({ error: "Access denied to this organization" });
        }
      } else {
        // Default: get patients by user
        const patients = sinceDate
          ? await storage.getRecentlySeenPatientsByUser(userId, sinceDate)
          : await storage.getPatientsByUser(userId);
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
      const query = (req.query.q as string || "").trim();
      const organizationId = req.query.organizationId ? parseInt(req.query.organizationId as string) : null;
      const isVendor = await hasAdminFeatureAccess(req);
      
      if (query.length < 1) {
        return res.json([]);
      }

      if (organizationId) {
        if (isVendor) {
          const patients = await storage.searchPatientsByOrganization(organizationId, query);
          return res.json(patients);
        }

        const members = await storage.getPracticeMembers(organizationId);
        const isMember = members.some((m: { userId: string }) => m.userId === userId);
        if (!isMember) {
          return res.status(403).json({ error: "Access denied to this organization" });
        }

        const patients = await storage.searchPatientsByOrganization(organizationId, query);
        return res.json(patients);
      }

      const patients = await storage.searchPatients(userId, query);
      return res.json(patients);
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
      
      const isVendor = await hasAdminFeatureAccess(req);
      
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
      
      const isVendor = await hasAdminFeatureAccess(req);
      
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
      const isVendor = await hasAdminFeatureAccess(req);
      
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
