import { convertToWav, splitAudioIntoChunks } from "./replit_integrations/audio/client";
import { Buffer } from "node:buffer";

const LOCAL_STT_URL = () => process.env.LOCAL_STT_URL;
const LOCAL_STT_API_KEY = () => process.env.LOCAL_STT_API_KEY;
const TRANSCRIPTION_PROVIDER = () => process.env.TRANSCRIPTION_PROVIDER;

export function isLocalSttEnabled(): boolean {
  if (TRANSCRIPTION_PROVIDER() === "local") {
    if (!LOCAL_STT_URL()) {
      throw new Error("TRANSCRIPTION_PROVIDER is set to 'local' but LOCAL_STT_URL is not configured.");
    }
    return true;
  }
  return false;
}

class SttAuthError extends Error {
  constructor(status: number, body: string) {
    super(`Local STT authentication failed (${status}): ${body || "Unauthorized"}. Check LOCAL_STT_API_KEY.`);
    this.name = "SttAuthError";
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transcribeChunkWithRetry(
  wavBuffer: Buffer,
  language?: string
): Promise<string> {
  const backoffDelays = [250, 750];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= backoffDelays.length; attempt++) {
    try {
      return await transcribeChunkLocal(wavBuffer, language);
    } catch (error: any) {
      if (error instanceof SttAuthError) {
        throw error;
      }
      lastError = error;
      if (attempt < backoffDelays.length) {
        const delay = backoffDelays[attempt];
        console.warn(`[local-stt] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error?.message);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error("Local STT transcription failed after retries");
}

async function transcribeChunkLocal(
  wavBuffer: Buffer,
  language?: string
): Promise<string> {
  const url = LOCAL_STT_URL();
  if (!url) throw new Error("LOCAL_STT_URL not configured");

  const endpoint = url.replace(/\/+$/, "") + "/v1/audio/transcriptions";

  const formData = new FormData();
  formData.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "audio.wav");
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "json");
  if (language) {
    formData.append("language", language);
  }

  const headers: Record<string, string> = {};
  const apiKey = LOCAL_STT_API_KEY();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
    headers,
    signal: AbortSignal.timeout(120_000),
  });

  if (response.status === 401 || response.status === 403) {
    const body = await response.text().catch(() => "");
    throw new SttAuthError(response.status, body);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Local STT returned ${response.status}: ${body}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json() as { text?: string };
    return data.text || "";
  }
  return await response.text();
}

export async function transcribeLocal(
  audioBuffer: Buffer,
  language?: string
): Promise<string> {
  const wavBuffer = await convertToWav(audioBuffer);

  const MAX_DIRECT_SIZE = 20 * 1024 * 1024;

  if (wavBuffer.length < MAX_DIRECT_SIZE) {
    console.log(
      "[local-stt] Audio under 20MB, transcribing directly",
      language ? `(language: ${language})` : ""
    );
    return await transcribeChunkWithRetry(wavBuffer, language);
  }

  console.log(
    `[local-stt] Audio is ${(wavBuffer.length / 1024 / 1024).toFixed(1)}MB, splitting into chunks...`
  );

  const chunks = await splitAudioIntoChunks(wavBuffer, 600);
  console.log(`[local-stt] Split into ${chunks.length} chunks`);

  const transcripts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[local-stt] Transcribing chunk ${i + 1}/${chunks.length}...`);
    try {
      const transcript = await transcribeChunkWithRetry(chunks[i], language);
      transcripts.push(transcript);
    } catch (error: any) {
      if (error instanceof SttAuthError) throw error;
      console.error(`[local-stt] Error transcribing chunk ${i + 1}:`, error?.message);
      transcripts.push(`[Transcription error in segment ${i + 1}]`);
    }
  }

  return transcripts.join(" ");
}
