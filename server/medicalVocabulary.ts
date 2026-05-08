import { storage } from "./storage";
import { DEFAULT_GLOBAL_MEDICAL_VOCABULARY } from "@shared/medical-vocabulary";

const MEDICAL_VOCABULARY_RESOURCE_TYPE = "global_medical_vocabulary";
const CACHE_TTL_MS = 60_000;
const MAX_CUSTOM_TERMS = 1500;
const MAX_TERM_LENGTH = 80;

const sortTermsAlpha = (terms: string[]) =>
  [...terms].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );

interface VocabularyCacheState {
  customTerms: string[];
  mergedTerms: string[];
  updatedAt: string | null;
  updatedBy: string | null;
  loadedAt: number;
}

let cachedVocabulary: VocabularyCacheState | null = null;

const normalizeTerms = (terms: string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of terms) {
    const term = raw.replace(/\s+/g, " ").trim();
    if (!term) continue;
    if (term.length > MAX_TERM_LENGTH) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(term);
  }
  return normalized;
};

const mergeTerms = (baseTerms: string[], customTerms: string[]) => {
  // Keep custom terms first so user-provided entries stay in the prompt budget.
  return normalizeTerms([...customTerms, ...baseTerms]);
};

const parseCustomTerms = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return sortTermsAlpha(
    normalizeTerms(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .slice(0, MAX_CUSTOM_TERMS)
    ),
  );
};

const parseCustomTermsFromDetails = (details: string | null) => {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details) as { customTerms?: unknown };
    return parseCustomTerms(parsed.customTerms);
  } catch {
    return [];
  }
};

const loadVocabularyFromStorage = async (): Promise<VocabularyCacheState> => {
  const now = Date.now();
  if (cachedVocabulary && now - cachedVocabulary.loadedAt < CACHE_TTL_MS) {
    return cachedVocabulary;
  }

  const logs = await storage.getAuditLogs({ resourceType: MEDICAL_VOCABULARY_RESOURCE_TYPE });
  const latestLog = logs[0];
  const customTerms = latestLog ? parseCustomTermsFromDetails(latestLog.details) : [];
  const state: VocabularyCacheState = {
    customTerms,
    mergedTerms: mergeTerms(DEFAULT_GLOBAL_MEDICAL_VOCABULARY, customTerms),
    updatedAt: latestLog?.timestamp ? new Date(latestLog.timestamp).toISOString() : null,
    updatedBy: latestLog?.userEmail || null,
    loadedAt: now,
  };

  cachedVocabulary = state;
  return state;
};

export const buildMedicalVocabularyPrompt = (terms: string[], maxTerms = 250) => {
  if (!terms.length) return "";
  const promptTerms = terms.slice(0, maxTerms);
  return [
    "Spelling preference: preserve exact clinical spelling for these terms when heard or inferred.",
    promptTerms.join(", "),
  ].join("\n");
};

export const getGlobalMedicalVocabulary = async () => {
  const state = await loadVocabularyFromStorage();
  return {
    defaultTerms: DEFAULT_GLOBAL_MEDICAL_VOCABULARY,
    customTerms: state.customTerms,
    terms: state.mergedTerms,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
  };
};

export const updateGlobalMedicalVocabulary = async (params: {
  customTerms: unknown;
  userId: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  const normalizedCustomTerms = parseCustomTerms(params.customTerms);

  await storage.createAuditLog({
    userId: params.userId,
    userEmail: params.userEmail || null,
    action: "updated",
    resourceType: MEDICAL_VOCABULARY_RESOURCE_TYPE,
    details: JSON.stringify({
      customTerms: normalizedCustomTerms,
      customTermsCount: normalizedCustomTerms.length,
      defaultTermsCount: DEFAULT_GLOBAL_MEDICAL_VOCABULARY.length,
    }),
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  cachedVocabulary = {
    customTerms: normalizedCustomTerms,
    mergedTerms: mergeTerms(DEFAULT_GLOBAL_MEDICAL_VOCABULARY, normalizedCustomTerms),
    updatedAt: new Date().toISOString(),
    updatedBy: params.userEmail || null,
    loadedAt: Date.now(),
  };

  return {
    defaultTerms: DEFAULT_GLOBAL_MEDICAL_VOCABULARY,
    customTerms: normalizedCustomTerms,
    terms: cachedVocabulary.mergedTerms,
    updatedAt: cachedVocabulary.updatedAt,
    updatedBy: cachedVocabulary.updatedBy,
  };
};
