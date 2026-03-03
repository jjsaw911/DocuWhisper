import crypto from "crypto";
import { storage } from "./storage";
import { setPersonalOpenAiKeyOverride } from "./openaiClient";

const AI_PERSONAL_KEY_RESOURCE_TYPE = "admin_ai_personal_key";
const CACHE_TTL_MS = 60_000;

interface PersonalKeyStatus {
  hasSavedPersonalKey: boolean;
  keyLast4: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface CachedState extends PersonalKeyStatus {
  loadedAt: number;
}

let cachedState: CachedState | null = null;

const getEncryptionSecret = () =>
  process.env.AI_SETTINGS_ENCRYPTION_KEY?.trim() ||
  process.env.SESSION_SECRET?.trim() ||
  "docuwhisper-default-ai-key";

const getEncryptionKey = () =>
  crypto.createHash("sha256").update(getEncryptionSecret()).digest();

const encryptValue = (value: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

const decryptValue = (encoded: string) => {
  const payload = Buffer.from(encoded, "base64");
  if (payload.length < 29) throw new Error("Invalid encrypted payload");

  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const ciphertext = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

const parseDetails = (details: string | null) => {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as {
      encryptedApiKey?: unknown;
      keyLast4?: unknown;
      cleared?: unknown;
    };

    if (parsed.cleared === true) {
      return { cleared: true as const, key: null, keyLast4: null as string | null };
    }

    if (typeof parsed.encryptedApiKey !== "string") return null;
    const decrypted = decryptValue(parsed.encryptedApiKey);
    return {
      cleared: false as const,
      key: decrypted,
      keyLast4: typeof parsed.keyLast4 === "string" ? parsed.keyLast4 : decrypted.slice(-4),
    };
  } catch {
    return null;
  }
};

const loadSavedPersonalKey = async (): Promise<CachedState> => {
  const now = Date.now();
  if (cachedState && now - cachedState.loadedAt < CACHE_TTL_MS) {
    return cachedState;
  }

  const logs = await storage.getAuditLogs({ resourceType: AI_PERSONAL_KEY_RESOURCE_TYPE });
  let nextState: CachedState = {
    hasSavedPersonalKey: false,
    keyLast4: null,
    updatedAt: null,
    updatedBy: null,
    loadedAt: now,
  };

  for (const log of logs) {
    const parsed = parseDetails(log.details);
    if (!parsed) continue;

    if (parsed.cleared) {
      setPersonalOpenAiKeyOverride(null);
      nextState = {
        hasSavedPersonalKey: false,
        keyLast4: null,
        updatedAt: log.timestamp ? new Date(log.timestamp).toISOString() : null,
        updatedBy: log.userEmail || null,
        loadedAt: now,
      };
      cachedState = nextState;
      return nextState;
    }

    if (parsed.key) {
      setPersonalOpenAiKeyOverride(parsed.key);
      nextState = {
        hasSavedPersonalKey: true,
        keyLast4: parsed.keyLast4,
        updatedAt: log.timestamp ? new Date(log.timestamp).toISOString() : null,
        updatedBy: log.userEmail || null,
        loadedAt: now,
      };
      cachedState = nextState;
      return nextState;
    }
  }

  setPersonalOpenAiKeyOverride(null);
  cachedState = nextState;
  return nextState;
};

export const initializeSavedPersonalAiKey = async () => {
  return loadSavedPersonalKey();
};

export const getSavedPersonalAiKeyStatus = async (): Promise<PersonalKeyStatus> => {
  const state = await loadSavedPersonalKey();
  return {
    hasSavedPersonalKey: state.hasSavedPersonalKey,
    keyLast4: state.keyLast4,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
  };
};

export const savePersonalAiKey = async (params: {
  apiKey: string;
  userId: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  const trimmed = params.apiKey.trim();
  if (!trimmed) {
    throw new Error("API key is required");
  }

  await storage.createAuditLog({
    userId: params.userId,
    userEmail: params.userEmail || null,
    action: "updated",
    resourceType: AI_PERSONAL_KEY_RESOURCE_TYPE,
    details: JSON.stringify({
      encryptedApiKey: encryptValue(trimmed),
      keyLast4: trimmed.slice(-4),
      cleared: false,
    }),
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  setPersonalOpenAiKeyOverride(trimmed);
  cachedState = {
    hasSavedPersonalKey: true,
    keyLast4: trimmed.slice(-4),
    updatedAt: new Date().toISOString(),
    updatedBy: params.userEmail || null,
    loadedAt: Date.now(),
  };

  return getSavedPersonalAiKeyStatus();
};

export const clearSavedPersonalAiKey = async (params: {
  userId: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  await storage.createAuditLog({
    userId: params.userId,
    userEmail: params.userEmail || null,
    action: "updated",
    resourceType: AI_PERSONAL_KEY_RESOURCE_TYPE,
    details: JSON.stringify({
      cleared: true,
    }),
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  setPersonalOpenAiKeyOverride(null);
  cachedState = {
    hasSavedPersonalKey: false,
    keyLast4: null,
    updatedAt: new Date().toISOString(),
    updatedBy: params.userEmail || null,
    loadedAt: Date.now(),
  };

  return getSavedPersonalAiKeyStatus();
};
