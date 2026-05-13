import { getAdminAiTextModel } from "./aiGenerationSettings";
import { buildMedicalVocabularyPrompt } from "./medicalVocabulary";
import { openai } from "./openaiClient";

type SpeakerSegment = {
  speaker: "clinician" | "patient";
  text: string;
  chunk_id: number;
  timestamp: number;
};

export type ClinicalNotePipelineParams = {
  transcript: string;
  patientName?: string;
  specialty?: string;
  noteStyle?: string | null;
  customPrompt?: string;
  aiInstructions?: string;
  outputLanguage?: string;
  context?: string;
  speakerSegments?: SpeakerSegment[];
  vocabularyTerms?: string[];
  label?: string;
};

export type ClinicalNotePipelineResult = {
  note: Record<string, unknown>;
  modelUsed: string;
  pipeline: {
    cleanupModel: string;
    usedLongTranscriptSummaries: boolean;
    originalEstimatedTokens: number;
    condensedEstimatedTokens: number;
    soapAttemptTrace: string[];
    fallbackReason: string | null;
  };
};

type CompletionAttemptTrace = {
  model: string;
  attempt: number;
  outcome: "ok" | "empty" | "invalid_json" | "error";
  detail?: string;
};

type HpiTemplateSpec = {
  styleHint: string | null;
  hpiRequirements: string[];
  planRequirements: string[];
  planLeadLabel: string | null;
};

type ResolvedNoteStyle = "detailed" | "concise" | "bullet_points";

const DEFAULT_CLEANUP_MODEL = readEnv("AI_TRANSCRIPT_CLEANUP_MODEL") || "gpt-5-nano";
const DEFAULT_SUMMARY_MODEL = readEnv("AI_TRANSCRIPT_SUMMARY_MODEL") || DEFAULT_CLEANUP_MODEL;
const DEFAULT_TITLE_MODEL = readEnv("AI_TITLE_MODEL") || DEFAULT_CLEANUP_MODEL;
const DEFAULT_SOAP_FALLBACK_MODEL = readEnv("AI_SOAP_FALLBACK_MODEL") || "gpt-5.1";
const MODEL_FALLBACK_FOR_LOW_COST_STAGES = readEnv("AI_LOW_COST_STAGE_FALLBACK_MODEL") || "gpt-4o-mini";
const LONG_TRANSCRIPT_THRESHOLD_TOKENS = readPositiveIntEnv("AI_TRANSCRIPT_SUMMARY_THRESHOLD_TOKENS", 8_000);
const CHUNK_TARGET_TOKENS = readPositiveIntEnv("AI_TRANSCRIPT_CHUNK_TOKENS", 2_400);
const CLEANUP_MAX_COMPLETION_TOKENS = readPositiveIntEnv("AI_TRANSCRIPT_CLEANUP_MAX_TOKENS", 900);
const SUMMARY_MAX_COMPLETION_TOKENS = readPositiveIntEnv("AI_TRANSCRIPT_SUMMARY_MAX_TOKENS", 500);
const MERGE_MAX_COMPLETION_TOKENS = readPositiveIntEnv("AI_TRANSCRIPT_MERGE_MAX_TOKENS", 900);
const SOAP_MAX_COMPLETION_TOKENS = readPositiveIntEnv("AI_SOAP_MAX_TOKENS", 1_600);

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish (Español)",
  fr: "French (Français)",
  de: "German (Deutsch)",
  pt: "Portuguese (Português)",
};

const TRANSCRIPT_CLEANUP_SYSTEM_PROMPT = [
  "You compress encounter transcripts for downstream note generation.",
  "Rules:",
  "- Keep only clinically relevant content from the transcript.",
  "- Remove filler words, greetings, repeated acknowledgements, counting tests, dictation artifacts, and obvious duplicates.",
  "- Preserve symptoms, durations, severity, negations, medications, allergies, exam findings, results, counseling, follow-up, and patient questions.",
  "- Keep chronology and speaker attribution when it helps clarify who said what.",
  "- Do not invent facts or convert the content into SOAP sections.",
  'Return valid JSON only: {"cleanedTranscript":"..."}',
].join("\n");

const TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT = [
  "You summarize one chunk of a medical encounter transcript for later note generation.",
  "Rules:",
  "- Preserve only clinically relevant facts from this chunk.",
  "- Remove filler words, greetings, repeated confirmations, and non-clinical chatter.",
  "- Keep chronology, negations, medications, allergies, exam findings, results, assessments, and follow-up instructions.",
  "- Do not invent facts and do not emit SOAP headings.",
  'Return valid JSON only: {"chunkSummary":"..."}',
].join("\n");

const TRANSCRIPT_MERGE_SYSTEM_PROMPT = [
  "You merge chunk summaries from the same medical encounter into one compact encounter brief.",
  "Rules:",
  "- Preserve all clinically relevant facts across chunks without duplication.",
  "- Keep chronology when it materially matters.",
  "- Keep speaker attribution only when it changes interpretation.",
  "- Do not invent facts and do not emit SOAP headings.",
  'Return valid JSON only: {"cleanedTranscript":"..."}',
].join("\n");

const DEFAULT_SOAP_SYSTEM_PROMPT = [
  "You generate structured SOAP notes from a condensed encounter brief.",
  "Rules:",
  "- Use only facts supplied in the encounter package.",
  '- If a section has no supporting detail, write "No information documented for this section."',
  "- Preserve patient-reported vs clinician-observed distinctions.",
  "- Preserve specific clinical details verbatim when present in the transcript: medication names, allergens (including specific triggers like bee/wasp/hornet/fire ant), dosages, durations, wait/observation times, anatomical sites, lab values, vitals, and procedure specifics. Do not generalize these into broader categories.",
  "- Keep wording clinically useful; avoid filler, but never drop named specifics.",
  "- Do not invent vitals, diagnoses, medications, or plans.",
  'Return valid JSON only with keys: subjective, objective, assessment, plan.',
].join("\n");

const TEMPLATE_SOAP_SYSTEM_PROMPT = [
  "You generate structured clinical notes from a condensed encounter brief using caller-supplied template instructions.",
  "Rules:",
  "- Use only facts supplied in the encounter package.",
  "- Follow the supplied template instructions exactly.",
  '- If the template requires a section and the encounter package lacks detail, write "No information documented for this section."',
  "- Preserve specific clinical details verbatim when present in the transcript: medication names, allergens, dosages, durations, wait/observation times, anatomical sites, lab values, vitals, and procedure specifics. Do not generalize these into broader categories.",
  "- Return app-compatible SOAP fields unless this is explicitly an HPI + Plan template.",
  "- Do not invent clinical content.",
  'Return valid JSON only with keys: subjective, objective, assessment, plan.',
].join("\n");

const HPI_PLAN_SYSTEM_PROMPT = [
  "You generate HPI + Plan notes from a condensed encounter brief using caller-supplied template instructions.",
  "Rules:",
  "- Use only facts supplied in the encounter package.",
  "- Follow the supplied template instructions exactly.",
  '- If a required section lacks detail, write "No information documented for this section."',
  "- Preserve specific clinical details verbatim when present in the transcript: medication names, allergens, dosages, durations, wait/observation times, anatomical sites, lab values, vitals, and procedure specifics. Do not generalize these into broader categories.",
  "- Keep HPI as a clinical narrative and Plan as clinically useful next steps.",
  "- Do not invent clinical content.",
  'Return valid JSON only with keys: hpi, plan.',
].join("\n");

const TITLE_SYSTEM_PROMPT = [
  "You create short clinical visit titles from a condensed encounter brief.",
  "Rules:",
  "- Return 2-6 words.",
  "- Prefer the main symptom, complaint, or reason for visit.",
  '- If unclear, use "General Consultation".',
  'Return valid JSON only: {"title":"..."}',
].join("\n");

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(readEnv(name), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeTranscriptText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\b(?:um+|uh+|erm+|mm[- ]hmm+|hmm+)\b/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // drop incidental "word list" recitations that sometimes get picked up by stt
    .replace(/\bword list\b[\s:-]*[^\n\r]*/gi, "")
    .trim();
}

function splitOversizedPart(part: string, maxTokens: number): string[] {
  if (estimateTokens(part) <= maxTokens) {
    return [part];
  }

  const sentences = part.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g)?.map((entry) => entry.trim()) || [part];
  if (sentences.length <= 1) {
    const words = part.split(/\s+/);
    const chunks: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (estimateTokens(next) > maxTokens && current) {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  return splitTextByEstimatedTokens(sentences.join("\n"), maxTokens, sentences);
}

function splitTextByEstimatedTokens(text: string, maxTokens: number, parts?: string[]): string[] {
  const sourceParts = parts || text.split(/\n{2,}/).map((entry) => entry.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const part of sourceParts) {
    const next = current ? `${current}\n\n${part}` : part;
    if (estimateTokens(next) <= maxTokens) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (estimateTokens(part) <= maxTokens) {
      current = part;
      continue;
    }

    const oversizedPieces = splitOversizedPart(part, maxTokens);
    for (const piece of oversizedPieces) {
      if (estimateTokens(piece) <= maxTokens) {
        chunks.push(piece);
      }
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

function buildTranscriptSource(params: ClinicalNotePipelineParams): string {
  if (params.speakerSegments && params.speakerSegments.length > 0) {
    return params.speakerSegments
      .map((segment) => `[${segment.speaker === "clinician" ? "Clinician" : "Patient"}] ${segment.text}`)
      .join("\n");
  }

  return params.transcript;
}

function buildEncounterMetadata(params: ClinicalNotePipelineParams): string {
  const lines: string[] = [];
  if (params.specialty) lines.push(`Specialty: ${params.specialty}`);
  if (params.patientName) lines.push(`Patient: ${params.patientName}`);
  if (params.context) {
    lines.push("Context:");
    lines.push(params.context);
  }
  if (params.aiInstructions) {
    lines.push("User instructions:");
    lines.push(params.aiInstructions);
  }
  const outputLanguage = params.outputLanguage || "en";
  if (outputLanguage !== "en") {
    lines.push(`Output language: ${LANGUAGE_NAMES[outputLanguage] || outputLanguage}`);
  }
  if (params.vocabularyTerms && params.vocabularyTerms.length > 0) {
    const vocabularyPrompt = buildMedicalVocabularyPrompt(params.vocabularyTerms, 220);
    if (vocabularyPrompt) {
      lines.push("Spelling guidance:");
      lines.push(vocabularyPrompt);
    }
  }
  return lines.join("\n");
}

function normalizeNoteStyle(noteStyle?: string | null): ResolvedNoteStyle {
  if (noteStyle === "concise" || noteStyle === "bullet_points") {
    return noteStyle;
  }
  return "detailed";
}

function isHpiTemplate(customPrompt: string): boolean {
  const normalized = customPrompt.toLowerCase();
  return (
    normalized.includes("hpi") &&
    (normalized.includes("section 1. hpi") ||
      normalized.includes("required structure") ||
      normalized.includes("hpi must appear"))
  );
}

function uniqueCompact(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function summarizeTemplateRequirements(text: string, keywords: string[], limit: number): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•*\-\d.()\s]+/, "").trim())
    .filter(Boolean);

  const matches = lines.filter((line) => {
    const normalized = line.toLowerCase();
    return keywords.some((keyword) => normalized.includes(keyword));
  });

  return uniqueCompact(matches, limit);
}

function parseHpiTemplateSpec(customPrompt: string): HpiTemplateSpec {
  const normalized = customPrompt.toLowerCase();
  const styleHint = normalized.includes("allergy/immunology")
    ? "allergy/immunology clinic style"
    : normalized.includes("allergy")
      ? "allergy clinic style"
      : normalized.includes("telehealth")
        ? "telehealth follow-up style"
        : null;

  const hpiRequirements = summarizeTemplateRequirements(
    customPrompt,
    [
      "symptom",
      "urticaria",
      "angioedema",
      "medication",
      "antihistamine",
      "adherence",
      "response to treatment",
      "side effects",
      "trigger",
      "history of present illness",
      "follow-up",
      "test",
      "reaction",
      "stable",
      "improved",
      "worsening",
      "insurance",
      "access",
    ],
    8,
  );

  const planRequirements = summarizeTemplateRequirements(
    customPrompt,
    [
      "plan",
      "impression",
      "continue",
      "start",
      "stop",
      "dose",
      "follow-up",
      "testing",
      "lab",
      "return",
      "epipen",
      "avoid",
      "monitor",
      "refill",
    ],
    8,
  );

  const planLeadLabel =
    normalized.includes("labeled exactly: impression") ||
    normalized.includes("label exactly: impression") ||
    normalized.includes("start plan with a short paragraph labeled exactly: impression")
      ? "Impression:"
      : null;

  return {
    styleHint,
    hpiRequirements,
    planRequirements,
    planLeadLabel,
  };
}

function buildCompactTemplateInstructions(
  customPrompt: string,
  noteStyle: ResolvedNoteStyle,
): string {
  const spec = parseHpiTemplateSpec(customPrompt);
  const lines: string[] = [];

  if (spec.styleHint) {
    lines.push(`Style: ${spec.styleHint}.`);
  }
  lines.push("Output exactly two JSON fields: hpi and plan.");
  if (noteStyle === "concise") {
    lines.push(
      "HPI: one short clinical paragraph only, focused on the chief complaint, interval change, key positives/negatives, response to treatment, and essential testing only.",
    );
    lines.push(
      "Keep HPI lean: no conversational filler, no repeated history, no unnecessary background, and no extra explanatory sentences.",
    );
    lines.push("Plan: only the immediate next steps, each action kept as short as safely possible.");
  } else if (noteStyle === "bullet_points") {
    lines.push(
      "HPI: one compact semicolon-delimited clinical line rather than a long narrative paragraph.",
    );
    lines.push("Plan: brief bullet-style action statements only.");
  } else {
    lines.push("HPI: one concise clinical paragraph in present-tense encounter style.");
    lines.push("Plan: concise clinical next steps only.");
  }
  if (spec.planLeadLabel) {
    lines.push(`Plan should begin with ${spec.planLeadLabel}`);
  }
  if (spec.hpiRequirements.length > 0) {
    lines.push(`Prioritize in HPI: ${spec.hpiRequirements.join("; ")}.`);
  }
  if (spec.planRequirements.length > 0) {
    lines.push(`Prioritize in Plan: ${spec.planRequirements.join("; ")}.`);
  }
  lines.push('If a required section lacks support, use "No information documented for this section."');

  return lines.join("\n");
}

function buildNoteStyleInstructions(
  noteStyle: ResolvedNoteStyle,
  usingHpiTemplate: boolean,
): string {
  if (noteStyle === "concise") {
    if (usingHpiTemplate) {
      return [
        "Documentation style preference: concise.",
        "Keep the HPI as short as clinically safe.",
        "Use only the clinically relevant details needed to understand the visit and support the plan.",
        "Avoid repetition, full-sentence narration when not necessary, and long explanatory transitions.",
        "Keep the plan limited to the actionable next steps only.",
      ].join("\n");
    }

    return [
      "Documentation style preference: concise.",
      "Use compressed clinical phrasing.",
      "Keep each SOAP section brief and omit repeated or low-value detail.",
      "Include only the clinically relevant positives, negatives, findings, and plan items needed for the chart.",
    ].join("\n");
  }

  if (noteStyle === "bullet_points") {
    if (usingHpiTemplate) {
      return [
        "Documentation style preference: bullet_points.",
        "Keep HPI in compact phrase-like form with semicolon-separated clinical fragments instead of a long narrative.",
        "Keep plan as short action bullets.",
      ].join("\n");
    }

    return [
      "Documentation style preference: bullet_points.",
      "Prefer brief bullet-style fragments in each SOAP section rather than prose paragraphs.",
    ].join("\n");
  }

  return [
    "Documentation style preference: detailed.",
    "Include clinically relevant supporting detail and useful context, but avoid duplication.",
  ].join("\n");
}

async function createJsonCompletionWithRetry(params: {
  label: string;
  model: string;
  fallbackModels?: string[];
  systemPrompt: string;
  userContent: string;
  requiredFields: string[];
  maxCompletionTokens: number;
  promptCacheKey: string;
  maxAttemptsPerModel?: number;
}) {
  const modelsToTry = Array.from(
    new Set([params.model, ...(params.fallbackModels || [])].filter(Boolean)),
  );
  let lastContent = "{}";
  let lastError: unknown = null;
  const trace: CompletionAttemptTrace[] = [];
  const attemptsPerModel = Math.max(1, params.maxAttemptsPerModel ?? 2);

  for (const model of modelsToTry) {
    for (let attemptIndex = 0; attemptIndex < attemptsPerModel; attemptIndex += 1) {
      const attemptNumber = attemptIndex + 1;
      const retryInstruction =
        attemptIndex === 0
          ? ""
          : `\n\nRETRY REQUIREMENT: Your previous response was empty, invalid, or missing required fields. Return valid JSON with non-empty ${params.requiredFields.join(", ")} values. If a required section truly has no supporting detail, write "No information documented for this section."`;

      try {
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: `${params.systemPrompt}${retryInstruction}` },
            { role: "user", content: params.userContent },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: params.maxCompletionTokens,
          prompt_cache_key: params.promptCacheKey,
        });

        const content = response.choices[0]?.message?.content || "{}";
        lastContent = content;
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (
          params.requiredFields.length === 0 ||
          hasMeaningfulStructuredContent(parsed, params.requiredFields)
        ) {
          trace.push({ model, attempt: attemptNumber, outcome: "ok" });
          return { parsed, content, model, trace };
        }

        trace.push({
          model,
          attempt: attemptNumber,
          outcome: "empty",
          detail: describeStructuredContentIssue(parsed, params.requiredFields),
        });
        lastError = new Error(
          `${params.label} returned empty structured content for ${model} on attempt ${attemptIndex + 1}.`,
        );
      } catch (error) {
        trace.push({
          model,
          attempt: attemptNumber,
          outcome: error instanceof SyntaxError ? "invalid_json" : "error",
          detail: summarizeErrorForTrace(error),
        });
        lastError = error;
        if (shouldAdvanceToFallbackModel(error)) {
          break;
        }
        if (!canRetryModelError(error)) {
          break;
        }
      }
    }
  }

  if (lastError) {
    throw Object.assign(lastError instanceof Error ? lastError : new Error(String(lastError)), {
      soapAttemptTrace: trace,
      lastStructuredContent: lastContent,
    });
  }
  throw new Error(`${params.label} failed. Last content: ${lastContent}`);
}

function hasMeaningfulStructuredContent(payload: Record<string, unknown>, requiredFields: string[]) {
  return requiredFields.some((field) => {
    const value = payload[field];
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return false;
  });
}

function describeStructuredContentIssue(
  payload: Record<string, unknown>,
  requiredFields: string[],
): string {
  const emptyFields = requiredFields.filter((field) => {
    const value = payload[field];
    if (typeof value === "string") return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (value && typeof value === "object") return Object.keys(value).length === 0;
    return true;
  });
  return emptyFields.length > 0
    ? `missing or empty: ${emptyFields.join(", ")}`
    : "missing required structured content";
}

function summarizeErrorForTrace(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  return raw.replace(/\s+/g, " ").trim().slice(0, 160);
}

function formatAttemptTrace(trace: CompletionAttemptTrace[]): string[] {
  return trace.map((entry) => {
    const base = `${entry.model}#${entry.attempt}:${entry.outcome}`;
    return entry.detail ? `${base}(${entry.detail})` : base;
  });
}

function buildFallbackReason(
  trace: CompletionAttemptTrace[],
  selectedModel: string,
  modelUsed: string,
): string | null {
  if (!selectedModel || selectedModel === modelUsed) {
    return null;
  }

  const selectedModelTrace = trace.filter((entry) => entry.model === selectedModel);
  if (selectedModelTrace.length === 0) {
    return `${selectedModel} was skipped before a successful fallback to ${modelUsed}.`;
  }

  const summary = selectedModelTrace
    .map((entry) => {
      const detail = entry.detail ? ` (${entry.detail})` : "";
      return `${entry.outcome}${detail}`;
    })
    .join(", ");
  return `${selectedModel} failed before fallback to ${modelUsed}: ${summary}`;
}

function canRetryModelError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (error instanceof SyntaxError) return true;
  if (message.includes("json")) return true;
  if (message.includes("unexpected token")) return true;
  if (message.includes("rate limit")) return true;
  if (message.includes("timeout")) return true;
  if (message.includes("temporarily")) return true;
  if (message.includes("empty")) return true;
  return false;
}

function shouldAdvanceToFallbackModel(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("do not have access") ||
    message.includes("does not exist") ||
    message.includes("unsupported model") ||
    message.includes("invalid model") ||
    (message.includes("model") && message.includes("not found"))
  );
}

async function condenseShortTranscript(
  transcript: string,
  label: string,
): Promise<{ cleanedTranscript: string; modelUsed: string }> {
  const { parsed, model } = await createJsonCompletionWithRetry({
    label: `${label}-cleanup`,
    model: DEFAULT_CLEANUP_MODEL,
    fallbackModels: [MODEL_FALLBACK_FOR_LOW_COST_STAGES],
    systemPrompt: TRANSCRIPT_CLEANUP_SYSTEM_PROMPT,
    userContent: `Encounter transcript:\n${transcript}`,
    requiredFields: ["cleanedTranscript"],
    maxCompletionTokens: CLEANUP_MAX_COMPLETION_TOKENS,
    promptCacheKey: "docuwhisper:transcript-cleanup:v1",
  });

  return {
    cleanedTranscript:
      typeof parsed.cleanedTranscript === "string" && parsed.cleanedTranscript.trim()
        ? parsed.cleanedTranscript.trim()
        : transcript,
    modelUsed: model,
  };
}

async function summarizeLongTranscript(
  transcript: string,
  label: string,
): Promise<{ cleanedTranscript: string; modelUsed: string }> {
  const chunks = splitTextByEstimatedTokens(transcript, CHUNK_TARGET_TOKENS);
  const chunkSummaries: string[] = [];
  let lastModel = DEFAULT_SUMMARY_MODEL;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const { parsed, model } = await createJsonCompletionWithRetry({
      label: `${label}-chunk-${index + 1}`,
      model: DEFAULT_SUMMARY_MODEL,
      fallbackModels: [MODEL_FALLBACK_FOR_LOW_COST_STAGES],
      systemPrompt: TRANSCRIPT_CHUNK_SUMMARY_SYSTEM_PROMPT,
      userContent: `Encounter transcript chunk ${index + 1} of ${chunks.length}:\n${chunk}`,
      requiredFields: ["chunkSummary"],
      maxCompletionTokens: SUMMARY_MAX_COMPLETION_TOKENS,
      promptCacheKey: "docuwhisper:transcript-chunk-summary:v1",
    });

    const summary =
      typeof parsed.chunkSummary === "string" && parsed.chunkSummary.trim()
        ? parsed.chunkSummary.trim()
        : chunk;
    chunkSummaries.push(summary);
    lastModel = model;
  }

  const mergedInput = chunkSummaries
    .map((summary, index) => `Chunk ${index + 1} summary:\n${summary}`)
    .join("\n\n");
  const { parsed, model } = await createJsonCompletionWithRetry({
    label: `${label}-merge`,
    model: DEFAULT_SUMMARY_MODEL,
    fallbackModels: [MODEL_FALLBACK_FOR_LOW_COST_STAGES],
    systemPrompt: TRANSCRIPT_MERGE_SYSTEM_PROMPT,
    userContent: mergedInput,
    requiredFields: ["cleanedTranscript"],
    maxCompletionTokens: MERGE_MAX_COMPLETION_TOKENS,
    promptCacheKey: "docuwhisper:transcript-merge:v1",
  });

  return {
    cleanedTranscript:
      typeof parsed.cleanedTranscript === "string" && parsed.cleanedTranscript.trim()
        ? parsed.cleanedTranscript.trim()
        : mergedInput,
    modelUsed: model || lastModel,
  };
}

async function condenseTranscriptForNote(
  params: ClinicalNotePipelineParams,
): Promise<{ condensedTranscript: string; modelUsed: string; usedLongTranscriptSummaries: boolean }> {
  const transcriptSource = normalizeTranscriptText(buildTranscriptSource(params));
  const estimatedTokens = estimateTokens(transcriptSource);

  try {
    if (estimatedTokens > LONG_TRANSCRIPT_THRESHOLD_TOKENS) {
      const summary = await summarizeLongTranscript(transcriptSource, params.label || "clinical-note");
      return {
        condensedTranscript: summary.cleanedTranscript,
        modelUsed: summary.modelUsed,
        usedLongTranscriptSummaries: true,
      };
    }

    return {
      condensedTranscript: transcriptSource,
      modelUsed: "none",
      usedLongTranscriptSummaries: false,
    };
  } catch (error) {
    console.warn(
      `[${params.label || "clinical-note"}] Transcript condensation failed, continuing with raw transcript.`,
      error,
    );
    return {
      condensedTranscript: transcriptSource,
      modelUsed: "none",
      usedLongTranscriptSummaries: false,
    };
  }
}

export async function generateClinicalNoteFromTranscript(
  params: ClinicalNotePipelineParams,
): Promise<ClinicalNotePipelineResult> {
  const transcriptSource = normalizeTranscriptText(buildTranscriptSource(params));
  const condensed = await condenseTranscriptForNote(params);
  const encounterMetadata = buildEncounterMetadata(params);
  const condensedTranscript = normalizeTranscriptText(condensed.condensedTranscript);
  const noteStyle = normalizeNoteStyle(params.noteStyle);

  const customPrompt = params.customPrompt?.trim() || "";
  const selectedSoapModel = getAdminAiTextModel();
  const usingHpiTemplate = customPrompt ? isHpiTemplate(customPrompt) : false;
  const primarySoapModel =
    usingHpiTemplate && selectedSoapModel === "gpt-5-mini"
      ? DEFAULT_SOAP_FALLBACK_MODEL
      : selectedSoapModel;
  let systemPrompt = DEFAULT_SOAP_SYSTEM_PROMPT;
  let requiredFields = ["subjective", "objective", "assessment", "plan"];
  let promptCacheKey = "docuwhisper:soap:default:v4";
  let templateInstructions = customPrompt;
  let maxAttemptsPerModel = 2;
  let forcedModelReason: string | null = null;

  if (customPrompt) {
    if (usingHpiTemplate) {
      systemPrompt = HPI_PLAN_SYSTEM_PROMPT;
      requiredFields = ["hpi", "plan"];
      promptCacheKey = `docuwhisper:soap:hpi:${noteStyle}:v4`;
      templateInstructions = buildCompactTemplateInstructions(customPrompt, noteStyle);
      if (selectedSoapModel === "gpt-5-mini") {
        forcedModelReason =
          "Templated HPI/Plan notes skip gpt-5-mini and go directly to gpt-5.1 to avoid wasted empty outputs.";
      }
    } else {
      systemPrompt = TEMPLATE_SOAP_SYSTEM_PROMPT;
      requiredFields = ["subjective", "objective", "assessment", "plan"];
      promptCacheKey = `docuwhisper:soap:template:${noteStyle}:v4`;
    }
  } else {
    promptCacheKey = `docuwhisper:soap:default:${noteStyle}:v4`;
  }

  const noteStyleInstructions = buildNoteStyleInstructions(noteStyle, usingHpiTemplate);

  const userContent = [
    encounterMetadata ? `Encounter metadata:\n${encounterMetadata}` : "",
    noteStyleInstructions ? `Documentation style instructions:\n${noteStyleInstructions}` : "",
    templateInstructions ? `Template instructions:\n${templateInstructions}` : "",
    `Condensed transcript:\n${condensedTranscript}`,
    `Original transcript token estimate: ${estimateTokens(transcriptSource)}`,
    `Condensed transcript token estimate: ${estimateTokens(condensedTranscript)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { parsed, model, trace } = await createJsonCompletionWithRetry({
    label: params.label || "clinical-note",
    model: primarySoapModel,
    fallbackModels:
      primarySoapModel === DEFAULT_SOAP_FALLBACK_MODEL ? [] : [DEFAULT_SOAP_FALLBACK_MODEL],
    systemPrompt,
    userContent,
    requiredFields,
    maxCompletionTokens: SOAP_MAX_COMPLETION_TOKENS,
    promptCacheKey,
    maxAttemptsPerModel,
  });

  const soapAttemptTrace = formatAttemptTrace(trace);
  return {
    note: parsed,
    modelUsed: model,
    pipeline: {
      cleanupModel: condensed.modelUsed,
      usedLongTranscriptSummaries: condensed.usedLongTranscriptSummaries,
      originalEstimatedTokens: estimateTokens(transcriptSource),
      condensedEstimatedTokens: estimateTokens(condensedTranscript),
      soapAttemptTrace,
      fallbackReason:
        forcedModelReason || buildFallbackReason(trace, selectedSoapModel, model),
    },
  };
}

export async function generateClinicalTitleFromTranscript(params: {
  transcript: string;
  label?: string;
}): Promise<string> {
  const normalizedTranscript = normalizeTranscriptText(params.transcript);
  if (!normalizedTranscript) {
    return "General Consultation";
  }

  const condensed = await condenseShortTranscript(
    normalizedTranscript,
    params.label || "generate-title",
  );
  const { parsed } = await createJsonCompletionWithRetry({
    label: params.label || "generate-title",
    model: DEFAULT_TITLE_MODEL,
    fallbackModels: [MODEL_FALLBACK_FOR_LOW_COST_STAGES],
    systemPrompt: TITLE_SYSTEM_PROMPT,
    userContent: `Encounter brief:\n${condensed.cleanedTranscript}`,
    requiredFields: ["title"],
    maxCompletionTokens: 60,
    promptCacheKey: "docuwhisper:title:v1",
  });

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  return title || "General Consultation";
}
