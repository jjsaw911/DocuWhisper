export type TranscriptionMode = "smart" | "live";

type TranscriptionConfig = {
  label: string;
  description: string;
  minSec: number;
  maxSec: number;
  silenceSec: number;
};

export const DEFAULT_TRANSCRIPTION_MODE: TranscriptionMode = "smart";

export const TRANSCRIPTION_MODES: Record<TranscriptionMode, TranscriptionConfig> = {
  smart: {
    label: "Smart (Balanced)",
    description: "Sends 5–15s chunks, flushes on silence for better accuracy and lower cost.",
    minSec: 5,
    maxSec: 15,
    silenceSec: 2.5,
  },
  live: {
    label: "Live (Low latency)",
    description: "Sends smaller 2–4s chunks for faster on-screen feedback.",
    minSec: 2,
    maxSec: 4,
    silenceSec: 1,
  },
};

export const getTranscriptionConfig = (mode?: string): TranscriptionConfig => {
  if (mode && mode in TRANSCRIPTION_MODES) {
    return TRANSCRIPTION_MODES[mode as TranscriptionMode];
  }
  return TRANSCRIPTION_MODES[DEFAULT_TRANSCRIPTION_MODE];
};
