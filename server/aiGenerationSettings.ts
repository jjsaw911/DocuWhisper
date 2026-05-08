import { storage } from "./storage";

export const ADMIN_AI_TEXT_MODELS = ["gpt-5.1", "gpt-5-mini", "gpt-4o", "gpt-4o-mini"] as const;

export type AdminAiTextModel = (typeof ADMIN_AI_TEXT_MODELS)[number];

export type AdminAiGenerationSettings = {
  textModel: AdminAiTextModel;
  monthlyBudgetUsd: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type CachedState = AdminAiGenerationSettings & {
  loadedAt: number;
};

type ModelPricing = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

const AI_GENERATION_SETTINGS_RESOURCE_TYPE = "admin_ai_generation_settings";
const CACHE_TTL_MS = 60_000;
const DEFAULT_TEXT_MODEL: AdminAiTextModel = "gpt-5.1";

const MODEL_PRICING_USD_PER_MILLION: Record<string, ModelPricing> = {
  "gpt-5.1": { inputPerMillionUsd: 1.25, outputPerMillionUsd: 10.0 },
  "gpt-5-mini": { inputPerMillionUsd: 0.25, outputPerMillionUsd: 2.0 },
  "gpt-5-nano": { inputPerMillionUsd: 0.05, outputPerMillionUsd: 0.4 },
  "gpt-4o": { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10.0 },
  "gpt-4o-mini": { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
  "gpt-4o-mini-transcribe": { inputPerMillionUsd: 1.25, outputPerMillionUsd: 5.0 },
  "gpt-4o-transcribe": { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10.0 },
  "gpt-audio": { inputPerMillionUsd: 2.5, outputPerMillionUsd: 10.0 },
  "gpt-image-1": { inputPerMillionUsd: 5.0, outputPerMillionUsd: 0.0 },
};

let cachedState: CachedState | null = null;

const isAdminAiTextModel = (value: unknown): value is AdminAiTextModel =>
  typeof value === "string" && ADMIN_AI_TEXT_MODELS.includes(value as AdminAiTextModel);

const toMonthlyBudget = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
};

const parseSettingsFromDetails = (details: string | null): Pick<
  AdminAiGenerationSettings,
  "textModel" | "monthlyBudgetUsd"
> | null => {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as {
      textModel?: unknown;
      monthlyBudgetUsd?: unknown;
    };

    if (!isAdminAiTextModel(parsed.textModel)) {
      return null;
    }

    return {
      textModel: parsed.textModel,
      monthlyBudgetUsd: toMonthlyBudget(parsed.monthlyBudgetUsd),
    };
  } catch {
    return null;
  }
};

const loadGenerationSettings = async (): Promise<CachedState> => {
  const now = Date.now();
  if (cachedState && now - cachedState.loadedAt < CACHE_TTL_MS) {
    return cachedState;
  }

  const logs = await storage.getAuditLogs({ resourceType: AI_GENERATION_SETTINGS_RESOURCE_TYPE });
  const latest = logs.find((log) => parseSettingsFromDetails(log.details));
  const parsed = latest ? parseSettingsFromDetails(latest.details) : null;

  const nextState: CachedState = {
    textModel: parsed?.textModel || DEFAULT_TEXT_MODEL,
    monthlyBudgetUsd: parsed?.monthlyBudgetUsd ?? null,
    updatedAt: latest?.timestamp ? new Date(latest.timestamp).toISOString() : null,
    updatedBy: latest?.userEmail || null,
    loadedAt: now,
  };

  cachedState = nextState;
  return nextState;
};

export const initializeAiGenerationSettings = async () => {
  return loadGenerationSettings();
};

export const getAiGenerationSettings = async (): Promise<AdminAiGenerationSettings> => {
  const state = await loadGenerationSettings();
  return {
    textModel: state.textModel,
    monthlyBudgetUsd: state.monthlyBudgetUsd,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
  };
};

export const getAdminAiTextModel = (): AdminAiTextModel =>
  cachedState?.textModel || DEFAULT_TEXT_MODEL;

export const getModelPricingUsdPerMillion = (model: string): ModelPricing | null =>
  MODEL_PRICING_USD_PER_MILLION[model] || null;

export const estimateModelCostUsd = (params: {
  model: string | null | undefined;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): number | null => {
  const model = params.model || "";
  const pricing = getModelPricingUsdPerMillion(model);
  if (!pricing) return null;

  const inputTokens = typeof params.inputTokens === "number" ? params.inputTokens : 0;
  const outputTokens = typeof params.outputTokens === "number" ? params.outputTokens : 0;

  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (outputTokens / 1_000_000) * pricing.outputPerMillionUsd
  );
};

export const updateAiGenerationSettings = async (params: {
  textModel: AdminAiTextModel;
  monthlyBudgetUsd: number | null;
  userId: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  const monthlyBudgetUsd = toMonthlyBudget(params.monthlyBudgetUsd);

  await storage.createAuditLog({
    userId: params.userId,
    userEmail: params.userEmail || null,
    action: "updated",
    resourceType: AI_GENERATION_SETTINGS_RESOURCE_TYPE,
    details: JSON.stringify({
      textModel: params.textModel,
      monthlyBudgetUsd,
    }),
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  cachedState = {
    textModel: params.textModel,
    monthlyBudgetUsd,
    updatedAt: new Date().toISOString(),
    updatedBy: params.userEmail || null,
    loadedAt: Date.now(),
  };

  return getAiGenerationSettings();
};
