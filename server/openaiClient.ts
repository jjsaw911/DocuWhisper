import OpenAI from "openai";

export type AiProviderSource = "personal" | "replit";

const personalApiKey = process.env.OPENAI_API_KEY?.trim() || "";
const personalBaseUrl = process.env.OPENAI_BASE_URL?.trim() || "";
const replitApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() || "";
const replitBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim() || "";

let preferredAiProviderSource: AiProviderSource = "personal";
let personalClient: OpenAI | null = null;
let replitClient: OpenAI | null = null;
let fallbackClient: OpenAI | null = null;

const createPersonalClient = () =>
  new OpenAI({
    ...(personalApiKey ? { apiKey: personalApiKey } : {}),
    ...(personalBaseUrl ? { baseURL: personalBaseUrl } : {}),
  });

const createReplitClient = () =>
  new OpenAI({
    ...(replitApiKey ? { apiKey: replitApiKey } : {}),
    ...(replitBaseUrl ? { baseURL: replitBaseUrl } : {}),
  });

const createFallbackClient = () =>
  new OpenAI({
    ...(personalApiKey ? { apiKey: personalApiKey } : replitApiKey ? { apiKey: replitApiKey } : {}),
    ...(personalBaseUrl
      ? { baseURL: personalBaseUrl }
      : replitBaseUrl
        ? { baseURL: replitBaseUrl }
        : {}),
  });

export const hasPersonalOpenAiKey = () => Boolean(personalApiKey);
export const hasReplitOpenAiKey = () => Boolean(replitApiKey);

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
    if (!personalClient) personalClient = createPersonalClient();
    return personalClient;
  }

  if (effectiveSource === "replit") {
    if (!replitClient) replitClient = createReplitClient();
    return replitClient;
  }

  if (!fallbackClient) fallbackClient = createFallbackClient();
  return fallbackClient;
};

// Thin dynamic wrapper so existing call sites continue to use `openai.*`.
const chatCompletionsCreate = (...args: any[]) =>
  (getOpenAIClient().chat.completions.create as any)(...args);
const audioTranscriptionsCreate = (...args: any[]) =>
  (getOpenAIClient().audio.transcriptions.create as any)(...args);
const imagesGenerate = (...args: any[]) =>
  (getOpenAIClient().images.generate as any)(...args);
const imagesEdit = (...args: any[]) =>
  (getOpenAIClient().images.edit as any)(...args);

export const openai = {
  chat: {
    completions: {
      create: chatCompletionsCreate,
    },
  },
  audio: {
    transcriptions: {
      create: audioTranscriptionsCreate,
    },
  },
  images: {
    generate: imagesGenerate,
    edit: imagesEdit,
  },
};

export const getOpenAiAuthSource = () => {
  const source = getEffectiveAiProviderSource();
  if (source === "personal") return "OPENAI_API_KEY";
  if (source === "replit") return "AI_INTEGRATIONS_OPENAI_API_KEY";
  return "UNSET";
};
