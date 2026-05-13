import OpenAI from "openai";
import { storage } from "./storage";
import { getRequestContext } from "./requestContext";

export type AiProviderSource = "personal" | "replit";

const envPersonalApiKey = process.env.OPENAI_API_KEY?.trim() || "";
const envPersonalBaseUrl = process.env.OPENAI_BASE_URL?.trim() || "";
const envReplitApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() || "";
const envReplitBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim() || "";

let preferredAiProviderSource: AiProviderSource = "personal";
let personalClient: OpenAI | null = null;
let replitClient: OpenAI | null = null;
let fallbackClient: OpenAI | null = null;
let personalClientSignature = "";
let replitClientSignature = "";
let fallbackClientSignature = "";
let personalApiKeyOverride = "";

const getResolvedPersonalApiKey = () => personalApiKeyOverride || envPersonalApiKey;
const getResolvedPersonalBaseUrl = () => envPersonalBaseUrl;
const getResolvedReplitApiKey = () => envReplitApiKey;
const getResolvedReplitBaseUrl = () => envReplitBaseUrl;

const createClient = (apiKey: string, baseUrl: string) =>
  new OpenAI({
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });

const createFallbackClient = () =>
  createClient(
    getResolvedPersonalApiKey() || getResolvedReplitApiKey(),
    getResolvedPersonalBaseUrl() || getResolvedReplitBaseUrl()
  );

export const setPersonalOpenAiKeyOverride = (apiKey: string | null) => {
  personalApiKeyOverride = apiKey?.trim() || "";
  personalClient = null;
  fallbackClient = null;
  personalClientSignature = "";
  fallbackClientSignature = "";
};

export const hasPersonalOpenAiKey = () => Boolean(getResolvedPersonalApiKey());
export const hasReplitOpenAiKey = () => Boolean(getResolvedReplitApiKey());
export const getOpenAiApiKeyForSource = (source: AiProviderSource) =>
  source === "personal" ? getResolvedPersonalApiKey() : getResolvedReplitApiKey();
export const getEffectiveOpenAiApiKey = () => getOpenAiApiKeyForSource(getEffectiveAiProviderSource());

export const getPersonalKeySource = () => {
  if (personalApiKeyOverride) return "saved";
  if (envPersonalApiKey) return "env";
  return "none";
};

export const setPreferredAiProviderSource = (source: AiProviderSource) => {
  preferredAiProviderSource = source;
};

export const getPreferredAiProviderSource = (): AiProviderSource => preferredAiProviderSource;

export const getEffectiveAiProviderSource = (): AiProviderSource => {
  if (preferredAiProviderSource === "personal") {
    return hasPersonalOpenAiKey() ? "personal" : hasReplitOpenAiKey() ? "replit" : "personal";
  }

  return hasReplitOpenAiKey() ? "replit" : hasPersonalOpenAiKey() ? "personal" : "replit";
};

export const getOpenAIClient = () => {
  const effectiveSource = getEffectiveAiProviderSource();

  if (effectiveSource === "personal") {
    const signature = `${getResolvedPersonalApiKey()}|${getResolvedPersonalBaseUrl()}`;
    if (!personalClient || personalClientSignature !== signature) {
      personalClient = createClient(getResolvedPersonalApiKey(), getResolvedPersonalBaseUrl());
      personalClientSignature = signature;
    }
    return personalClient;
  }

  if (effectiveSource === "replit") {
    const signature = `${getResolvedReplitApiKey()}|${getResolvedReplitBaseUrl()}`;
    if (!replitClient || replitClientSignature !== signature) {
      replitClient = createClient(getResolvedReplitApiKey(), getResolvedReplitBaseUrl());
      replitClientSignature = signature;
    }
    return replitClient;
  }

  const fallbackSignature = `${getResolvedPersonalApiKey()}|${getResolvedReplitApiKey()}|${getResolvedPersonalBaseUrl()}|${getResolvedReplitBaseUrl()}`;
  if (!fallbackClient || fallbackClientSignature !== fallbackSignature) {
    fallbackClient = createFallbackClient();
    fallbackClientSignature = fallbackSignature;
  }
  return fallbackClient;
};

// Thin dynamic wrapper so existing call sites continue to use `openai.*`.
const chatCompletionsCreate = (...args: any[]): Promise<any> =>
  (getOpenAIClient().chat.completions.create as any)(...args);
const audioTranscriptionsCreate = (...args: any[]): Promise<any> =>
  (getOpenAIClient().audio.transcriptions.create as any)(...args);
const imagesGenerate = (...args: any[]): Promise<any> =>
  (getOpenAIClient().images.generate as any)(...args);
const imagesEdit = (...args: any[]): Promise<any> =>
  (getOpenAIClient().images.edit as any)(...args);

const toFiniteNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
};

const logAiUsage = (params: {
  provider: AiProviderSource;
  operation: "chat.completions" | "audio.transcriptions" | "images.generate" | "images.edit";
  model?: string;
  success: boolean;
  durationMs: number;
  errorCode?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}) => {
  const requestContext = getRequestContext();
  const actorUserId = requestContext?.userId || "ai_system";
  const actorUserEmail = requestContext?.userEmail ?? null;

  void storage.createAuditLog({
    userId: actorUserId,
    userEmail: actorUserEmail,
    action: params.success ? "called" : "failed",
    resourceType: "ai_usage",
    details: JSON.stringify({
      actorUserId,
      provider: params.provider,
      operation: params.operation,
      model: params.model || null,
      success: params.success,
      durationMs: Math.max(0, Math.round(params.durationMs)),
      errorCode: params.errorCode || null,
      usage: params.usage || null,
      method: requestContext?.method || null,
      path: requestContext?.path || null,
    }),
  }).catch((error) => {
    console.error("Failed to persist AI usage event:", error);
  });
};

const extractUsage = (result: any) => {
  const usage = result?.usage;
  if (!usage || typeof usage !== "object") return undefined;

  const inputTokens = toFiniteNumber((usage as any).input_tokens ?? (usage as any).prompt_tokens);
  const outputTokens = toFiniteNumber((usage as any).output_tokens ?? (usage as any).completion_tokens);
  const totalTokens = toFiniteNumber((usage as any).total_tokens ?? ((inputTokens || 0) + (outputTokens || 0)));
  if (
    typeof inputTokens !== "number" &&
    typeof outputTokens !== "number" &&
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return {
    ...(typeof inputTokens === "number" ? { inputTokens } : {}),
    ...(typeof outputTokens === "number" ? { outputTokens } : {}),
    ...(typeof totalTokens === "number" ? { totalTokens } : {}),
  };
};

const withUsageLogging = async <T>(params: {
  operation: "chat.completions" | "audio.transcriptions" | "images.generate" | "images.edit";
  model?: string;
  invoke: () => Promise<T>;
}): Promise<T> => {
  const startedAt = Date.now();
  const provider = getEffectiveAiProviderSource();
  try {
    const result = await params.invoke();
    logAiUsage({
      provider,
      operation: params.operation,
      model: params.model,
      success: true,
      durationMs: Date.now() - startedAt,
      usage: extractUsage(result),
    });
    return result;
  } catch (error: any) {
    logAiUsage({
      provider,
      operation: params.operation,
      model: params.model,
      success: false,
      durationMs: Date.now() - startedAt,
      errorCode: typeof error?.code === "string" ? error.code : undefined,
    });
    throw error;
  }
};

export const openai = {
  chat: {
    completions: {
      create: (request: any, ...rest: any[]): Promise<any> =>
        withUsageLogging<any>({
          operation: "chat.completions",
          model: typeof request?.model === "string" ? request.model : undefined,
          invoke: () => chatCompletionsCreate(request, ...rest),
        }),
    },
  },
  audio: {
    transcriptions: {
      create: (request: any, ...rest: any[]): Promise<any> =>
        withUsageLogging<any>({
          operation: "audio.transcriptions",
          model: typeof request?.model === "string" ? request.model : undefined,
          invoke: () => audioTranscriptionsCreate(request, ...rest),
        }),
    },
  },
  images: {
    generate: (request: any, ...rest: any[]): Promise<any> =>
      withUsageLogging<any>({
        operation: "images.generate",
        model: typeof request?.model === "string" ? request.model : undefined,
        invoke: () => imagesGenerate(request, ...rest),
      }),
    edit: (request: any, ...rest: any[]): Promise<any> =>
      withUsageLogging<any>({
        operation: "images.edit",
        model: typeof request?.model === "string" ? request.model : undefined,
        invoke: () => imagesEdit(request, ...rest),
      }),
  },
};

export const getOpenAiAuthSource = () => {
  const source = getEffectiveAiProviderSource();
  if (source === "personal") return "OPENAI_API_KEY";
  if (source === "replit") return "AI_INTEGRATIONS_OPENAI_API_KEY";
  return "UNSET";
};
