import { convertToWav, splitAudioIntoChunks } from "./replit_integrations/audio/client";
import { Buffer } from "node:buffer";

const STT_SERVER_URL = () => process.env.STT_SERVER_URL;
const STT_API_KEY = () => process.env.STT_API_KEY;

export function isSelfHostedSttEnabled(): boolean {
  return !!STT_SERVER_URL();
}

async function transcribeChunkSelfHosted(
  wavBuffer: Buffer,
  language?: string
): Promise<string> {
  const url = STT_SERVER_URL();
  if (!url) throw new Error("STT_SERVER_URL not configured");

  const endpoint = url.replace(/\/+$/, "") + "/v1/audio/transcriptions";

  const formData = new FormData();
  formData.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "audio.wav");
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "json");
  if (language) {
    formData.append("language", language);
  }

  const headers: Record<string, string> = {};
  const apiKey = STT_API_KEY();
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
    headers,
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Self-hosted STT returned ${response.status}: ${body}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await response.json() as { text?: string };
    return data.text || "";
  }
  return await response.text();
}

export async function transcribeSelfHosted(
  audioBuffer: Buffer,
  language?: string
): Promise<string> {
  const wavBuffer = await convertToWav(audioBuffer);

  const MAX_DIRECT_SIZE = 20 * 1024 * 1024;

  if (wavBuffer.length < MAX_DIRECT_SIZE) {
    console.log(
      "[self-hosted-stt] Audio under 20MB, transcribing directly",
      language ? `(language: ${language})` : ""
    );
    return await transcribeChunkSelfHosted(wavBuffer, language);
  }

  console.log(
    `[self-hosted-stt] Audio is ${(wavBuffer.length / 1024 / 1024).toFixed(1)}MB, splitting into chunks...`
  );

  const chunks = await splitAudioIntoChunks(wavBuffer, 600);
  console.log(`[self-hosted-stt] Split into ${chunks.length} chunks`);

  const transcripts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[self-hosted-stt] Transcribing chunk ${i + 1}/${chunks.length}...`);
    try {
      const transcript = await transcribeChunkSelfHosted(chunks[i], language);
      transcripts.push(transcript);
    } catch (error: any) {
      console.error(`[self-hosted-stt] Error transcribing chunk ${i + 1}:`, error?.message);
      transcripts.push(`[Transcription error in segment ${i + 1}]`);
    }
  }

  return transcripts.join(" ");
}
