const VAST_AI_API_KEY = () => process.env.VAST_AI_API_KEY;

export function getVastAiApiKey(): string | undefined {
  const key = VAST_AI_API_KEY()?.trim();
  return key || undefined;
}

export function isVastAiConfigured(): boolean {
  return Boolean(getVastAiApiKey());
}
