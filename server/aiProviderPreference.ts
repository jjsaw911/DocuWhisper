import { storage } from "./storage";
import {
  AiProviderSource,
  getEffectiveAiProviderSource,
  getPreferredAiProviderSource,
  hasPersonalOpenAiKey,
  hasReplitOpenAiKey,
  setPreferredAiProviderSource,
} from "./openaiClient";

const AI_PROVIDER_PREFERENCE_RESOURCE_TYPE = "ai_provider_preference";
const CACHE_TTL_MS = 60_000;

interface AiProviderPreferenceState {
  preferredSource: AiProviderSource;
  updatedAt: string | null;
  updatedBy: string | null;
  loadedAt: number;
}

let cachedState: AiProviderPreferenceState | null = null;

const isAiProviderSource = (value: unknown): value is AiProviderSource =>
  value === "personal" || value === "replit";

const parsePreferredSourceFromDetails = (details: string | null): AiProviderSource | null => {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as { preferredSource?: unknown };
    if (isAiProviderSource(parsed.preferredSource)) {
      return parsed.preferredSource;
    }
    return null;
  } catch {
    return null;
  }
};

const loadPreferenceFromStorage = async (): Promise<AiProviderPreferenceState> => {
  const now = Date.now();
  if (cachedState && now - cachedState.loadedAt < CACHE_TTL_MS) {
    return cachedState;
  }

  const logs = await storage.getAuditLogs({ resourceType: AI_PROVIDER_PREFERENCE_RESOURCE_TYPE });
  const latest = logs.find((log) => parsePreferredSourceFromDetails(log.details));
  const preferredSource =
    (latest ? parsePreferredSourceFromDetails(latest.details) : null) || getPreferredAiProviderSource();

  setPreferredAiProviderSource(preferredSource);

  const state: AiProviderPreferenceState = {
    preferredSource,
    updatedAt: latest?.timestamp ? new Date(latest.timestamp).toISOString() : null,
    updatedBy: latest?.userEmail || null,
    loadedAt: now,
  };

  cachedState = state;
  return state;
};

export const initializeAiProviderPreference = async () => {
  return loadPreferenceFromStorage();
};

export const getAiProviderPreference = async () => {
  const state = await loadPreferenceFromStorage();
  const effectiveSource = getEffectiveAiProviderSource();
  return {
    preferredSource: state.preferredSource,
    effectiveSource,
    hasPersonalKey: hasPersonalOpenAiKey(),
    hasReplitKey: hasReplitOpenAiKey(),
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
  };
};

export const updateAiProviderPreference = async (params: {
  preferredSource: AiProviderSource;
  userId: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  setPreferredAiProviderSource(params.preferredSource);

  await storage.createAuditLog({
    userId: params.userId,
    userEmail: params.userEmail || null,
    action: "updated",
    resourceType: AI_PROVIDER_PREFERENCE_RESOURCE_TYPE,
    details: JSON.stringify({
      preferredSource: params.preferredSource,
      effectiveSource: getEffectiveAiProviderSource(),
      hasPersonalKey: hasPersonalOpenAiKey(),
      hasReplitKey: hasReplitOpenAiKey(),
    }),
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  const nowIso = new Date().toISOString();
  cachedState = {
    preferredSource: params.preferredSource,
    updatedAt: nowIso,
    updatedBy: params.userEmail || null,
    loadedAt: Date.now(),
  };

  return {
    preferredSource: params.preferredSource,
    effectiveSource: getEffectiveAiProviderSource(),
    hasPersonalKey: hasPersonalOpenAiKey(),
    hasReplitKey: hasReplitOpenAiKey(),
    updatedAt: nowIso,
    updatedBy: params.userEmail || null,
  };
};
