import { readFile } from "node:fs/promises";
import path from "node:path";

type MobileApiSuccess<T> = { success: true; data: T };
type MobileApiError = { success?: false; error?: string; message?: string; details?: unknown };

const usage = `
Smoke test: mobile transcribe -> SOAP

Required env:
  SMOKE_API_KEY=dw_pk_...
  SMOKE_AUDIO_FILE=/absolute/path/to/audio.(wav|webm|m4a|mp3|ogg)

Optional env:
  SMOKE_BASE_URL=http://127.0.0.1:5000
  SMOKE_LANGUAGE=en
  SMOKE_PATIENT_NAME="Test Patient"
  SMOKE_SPECIALTY="Primary Care"
  SMOKE_FALLBACK_TRANSCRIPT="optional transcript used if audio transcribes empty"

Example:
  SMOKE_API_KEY=dw_pk_xxx \\
  SMOKE_AUDIO_FILE=/tmp/smoke.wav \\
  npm run smoke:transcribe-soap
`.trim();

function toApiUrl(baseUrl: string, apiPath: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${apiPath}`;
}

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".wav":
      return "audio/wav";
    case ".webm":
      return "audio/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Expected JSON response (${response.status}), got: ${text.slice(0, 300)}`);
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage);
    return;
  }

  const baseUrl = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000").trim();
  const apiKey = process.env.SMOKE_API_KEY?.trim();
  const audioPathRaw = process.env.SMOKE_AUDIO_FILE?.trim();
  const language = (process.env.SMOKE_LANGUAGE || "en").trim();
  const patientName = process.env.SMOKE_PATIENT_NAME?.trim() || "Smoke Test Patient";
  const specialty = process.env.SMOKE_SPECIALTY?.trim() || "Primary Care";
  const fallbackTranscript = process.env.SMOKE_FALLBACK_TRANSCRIPT?.trim();

  if (!apiKey || !audioPathRaw) {
    throw new Error(`Missing required env vars.\n\n${usage}`);
  }

  if (!apiKey.startsWith("dw_pk_")) {
    throw new Error("SMOKE_API_KEY must be a personal API key that starts with 'dw_pk_'.");
  }

  const audioPath = path.resolve(audioPathRaw);
  const audioBuffer = await readFile(audioPath);
  if (!audioBuffer.length) {
    throw new Error(`Audio file is empty: ${audioPath}`);
  }

  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  const transcribeForm = new FormData();
  transcribeForm.append(
    "audio",
    new Blob([audioBuffer], { type: inferMimeType(audioPath) }),
    path.basename(audioPath),
  );
  transcribeForm.append("language", language);
  transcribeForm.append("chunk_id", "1");

  const transcribeUrl = toApiUrl(baseUrl, "/api/mobile/transcribe");
  const transcribeStart = Date.now();
  const transcribeResponse = await fetch(transcribeUrl, {
    method: "POST",
    headers: authHeaders,
    body: transcribeForm,
  });
  const transcribeMs = Date.now() - transcribeStart;

  const transcribeBody = await parseJsonResponse<
    MobileApiSuccess<{ transcript?: string; provider?: string; fallback_used?: boolean }> | MobileApiError
  >(transcribeResponse);

  if (!transcribeResponse.ok || !("success" in transcribeBody) || !transcribeBody.success) {
    throw new Error(
      `Transcribe failed (${transcribeResponse.status}): ${JSON.stringify(transcribeBody).slice(0, 600)}`,
    );
  }

  let transcript = transcribeBody.data.transcript?.trim() || "";
  if (!transcript && fallbackTranscript) {
    transcript = fallbackTranscript;
  }
  if (!transcript) {
    throw new Error(
      "Transcription returned empty text. Provide clearer audio or set SMOKE_FALLBACK_TRANSCRIPT for SOAP smoke testing.",
    );
  }

  console.log(
    `[smoke] transcribe ok: provider=${transcribeBody.data.provider || "unknown"}, fallback_used=${Boolean(
      transcribeBody.data.fallback_used,
    )}, latency_ms=${transcribeMs}, transcript_chars=${transcript.length}`,
  );

  const soapUrl = toApiUrl(baseUrl, "/api/mobile/generate-soap");
  const soapStart = Date.now();
  const soapResponse = await fetch(soapUrl, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transcript,
      patientName,
      specialty,
    }),
  });
  const soapMs = Date.now() - soapStart;

  const soapBody = await parseJsonResponse<
    MobileApiSuccess<Record<string, unknown>> | MobileApiError
  >(soapResponse);

  if (!soapResponse.ok || !("success" in soapBody) || !soapBody.success) {
    throw new Error(`SOAP generation failed (${soapResponse.status}): ${JSON.stringify(soapBody).slice(0, 600)}`);
  }

  const note = soapBody.data || {};
  const hasSection = ["subjective", "objective", "assessment", "plan", "hpi"].some((key) => {
    const value = note[key];
    return typeof value === "string" && value.trim().length > 0;
  });
  if (!hasSection) {
    throw new Error(`SOAP response missing expected note sections: ${JSON.stringify(note).slice(0, 600)}`);
  }

  console.log(`[smoke] soap ok: latency_ms=${soapMs}, keys=${Object.keys(note).join(",")}`);
  console.log("[smoke] PASS");
}

main().catch((error) => {
  console.error("[smoke] FAIL:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
