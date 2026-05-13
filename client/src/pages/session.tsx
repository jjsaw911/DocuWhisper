import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  canViewBetaSoapDebug,
  formatSoapDebugLabel,
  formatSoapDebugSecondary,
  readSoapDebugFailureFromError,
  readSoapDebugInfoFromResponse,
  saveSoapDebugInfo,
  type SoapDebugInfo,
} from "@/lib/soap-debug";
import { getNoteCreditError } from "@/lib/subscription-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import { MedicalAutocomplete } from "@/components/medical-autocomplete";
import { DrugInteractionAlert } from "@/components/drug-interaction-alert";
import { useRecording } from "@/contexts/recording-context";
import { dispatchActivityEvent } from "@/hooks/use-session-timeout";
import { finishScribeGeneration, startScribeGeneration } from "@/hooks/use-scribe-generation-status";
import { getTranscriptionConfig } from "@/lib/transcription";
import {
  Mic,
  Square,
  Pause,
  Play,
  Upload,
  Copy,
  Loader2,
  Calendar,
  Globe,
  Sparkles,
  AudioLines,
  AlertCircle,
  FileText,
  Send,
  Wand2,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Stethoscope,
  UserRound,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Template = {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean | null;
};

type RecordingState = "idle" | "recording" | "paused" | "processing";

type VisitMode = "transcribing" | "dictating" | "upload";

type TranscriptEntry = {
  timestamp: string;
  text: string;
  type: "system" | "content";
};

type Speaker = "clinician" | "patient";

type StructuredSegment = {
  speaker: Speaker;
  text: string;
  chunk_id: number;
  timestamp: number;
};

const normalizeSpeakerCoverageText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeRecoveryTranscriptText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const recoveryTranscriptsMatch = (left?: string | null, right?: string | null) => {
  const normalizedLeft = normalizeRecoveryTranscriptText(left || "");
  const normalizedRight = normalizeRecoveryTranscriptText(right || "");

  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const [shorter, longer] =
    normalizedLeft.length <= normalizedRight.length
      ? [normalizedLeft, normalizedRight]
      : [normalizedRight, normalizedLeft];

  return shorter.length >= 48 && longer.includes(shorter);
};

type ResumeNoteData = {
  id: number;
  title: string;
  transcript: string;
  patientName: string | null;
  patientContext: string | null;
  icdCodes?: unknown;
  soapSourceHash?: string | null;
  soapStale?: boolean;
};

type SessionSavedNote = {
  id: number;
  [key: string]: unknown;
};

type InflightScribeRecovery = {
  id?: string;
  transcript: string;
  patientName: string;
  contextText: string;
  savedAt: string;
  reason?: string;
  noteId?: number | null;
  noteTitle?: string | null;
};

type RecoverableDraft = {
  id: string;
  transcript: string;
  patientName: string;
  specialty: string;
  contextText: string;
  savedAt: string;
  source: "backup" | "inflight" | "manual_defer" | "soap_error";
  noteId?: number | null;
  noteTitle?: string | null;
};

type TranscriptionProviderStatus = {
  provider: "local" | "openai";
  configuredProvider: string;
  localUrlConfigured: boolean;
  localApiKeyConfigured: boolean;
  reason?: string;
};

const getFallbackTitle = (patientName?: string) =>
  patientName ? `${patientName} - ${new Date().toLocaleDateString()}` : `Session - ${new Date().toLocaleDateString()}`;

const getChiefComplaintPreview = (transcript: string) => {
  const cleaned = transcript
    .replace(/\[(Clinician|Patient)\]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "Chief complaint";

  const firstSentence = cleaned.split(/[.!?]/)[0]?.trim() || cleaned;
  const words = firstSentence.split(" ").filter(Boolean).slice(0, 8);
  if (words.length === 0) return "Chief complaint";

  const preview = words.join(" ").replace(/[,:;]+$/, "");
  return preview.charAt(0).toUpperCase() + preview.slice(1);
};

export default function Session() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setIsRecording: setGlobalRecording, setAudioLevel: setGlobalAudioLevel } = useRecording();

  const isNewSession = !params.id || params.id === "new";
  
  // Check for resume mode from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const resumeNoteId = urlParams.get("resumeId");
  const importNoteId = urlParams.get("fromNoteId");
  const autoStartRecording = urlParams.get("autoStart") === "true";
  const [isResumeMode, setIsResumeMode] = useState(!!resumeNoteId);
  const [resumeNoteData, setResumeNoteData] = useState<ResumeNoteData | null>(null);
  const [isManualImportDialogOpen, setIsManualImportDialogOpen] = useState(false);
  const [manualTranscriptInput, setManualTranscriptInput] = useState("");
  const [isSoapDeferred, setIsSoapDeferred] = useState(false);
  
  // Refs to avoid stale closures in async callbacks
  const isResumeModeRef = useRef(!!resumeNoteId);
  const resumeNoteDataRef = useRef<typeof resumeNoteData>(null);
  const hasAutoStartedRef = useRef(false);
  const hasImportedFromNoteRef = useRef(false);
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const isSoapDeferredRef = useRef(false);

  const [patientName, setPatientName] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState<number[]>([0, 0, 0, 0, 0]);
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default");
  const [activeTab, setActiveTab] = useState("transcript");
  const [soapNote, setSoapNote] = useState<{
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    hpi?: string;
    icdCodes?: {
      codes?: { code: string; description: string; category: string; confidence: string }[];
      cptCodes?: { code: string; description: string; rationale: string }[];
      priorAuthDxCodes?: {
        code: string;
        description: string;
        medication?: string;
        rationale?: string;
        confidence?: string;
      }[];
      visitTimeMinutes?: number;
    };
    [key: string]:
      | string
      | {
          codes?: unknown[];
          cptCodes?: unknown[];
          priorAuthDxCodes?: unknown[];
          visitTimeMinutes?: number;
        }
      | undefined;
  } | null>(null);
  const [soapDebugInfo, setSoapDebugInfo] = useState<SoapDebugInfo | null>(null);
  
  // New features: Visit mode, Context, AI command
  const [visitMode, setVisitMode] = useState<VisitMode>("transcribing");
  const [contextText, setContextText] = useState("");
  const [aiCommand, setAiCommand] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const canViewSoapDebug = useMemo(() => canViewBetaSoapDebug(user), [user]);
  
  // AI Differential search
  const [differentialResults, setDifferentialResults] = useState<{
    differentials: { diagnosis: string; likelihood: string; rationale: string }[];
    recommendedLabs: { test: string; purpose: string }[];
    redFlags: string[];
    clinicalPearls: string[];
  } | null>(null);
  const [isDifferentialSearching, setIsDifferentialSearching] = useState(false);

  // Microphone selection
  const [availableMicrophones, setAvailableMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>("");

  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTranscribingRef = useRef<boolean>(false);
  const transcribeLockSessionRef = useRef<string | null>(null);
  const lastActivityDispatchRef = useRef<number>(0); // For throttled session activity
  
  type ChunkItem = { id: number; blob: Blob; processed: boolean; timestampSec: number; peakLevel: number; rmsMax: number; speechFrames: number; speaker: Speaker };
  const pendingChunksRef = useRef<ChunkItem[]>([]);
  const nextChunkIdRef = useRef<number>(0);
  const processedChunkIdsRef = useRef<Set<number>>(new Set());
  const recordingSessionIdRef = useRef<string>("");
  type OrderedChunkEntry = { text: string; timestampSec: number; speaker: Speaker };
  const orderedChunksRef = useRef<Map<number, OrderedChunkEntry>>(new Map());
  const nextExpectedChunkIdRef = useRef<number>(1);
  const droppedChunksRef = useRef<Set<number>>(new Set());

  type FinalizeSnapshot = {
    transcript: string;
    pendingChunks: ChunkItem[];
    orderedChunks: Map<number, OrderedChunkEntry>;
    droppedChunks: Set<number>;
    nextExpectedChunkId: number;
    structuredSegments: StructuredSegment[];
    patientName: string;
    contextText: string;
    selectedTemplateId: string;
    transcriptionLanguage: string;
    resumeMode: boolean;
    resumeNoteData: ResumeNoteData | null;
    sessionId: string;
    sessionDurationSeconds: number;
    draftRecoveryId: string;
  };

  type AutoGenerateAndSaveOptions = {
    background?: boolean;
    forceSoapGeneration?: boolean;
    patientName?: string;
    contextText?: string;
    selectedTemplateId?: string;
    transcriptionLanguage?: string;
    speakerSegments?: StructuredSegment[];
    resumeMode?: boolean;
    resumeNoteData?: ResumeNoteData | null;
    sessionDurationSeconds?: number;
    draftRecoveryId?: string;
  };

  const VAD_RMS_THRESHOLD = 0.02;
  const MIN_SPEECH_FRAMES = 10;
  const segmentRmsMaxRef = useRef<Map<number, number>>(new Map());
  const segmentSpeechFramesRef = useRef<Map<number, number>>(new Map());
  const [vadStats, setVadStats] = useState({ uploaded: 0, dropped: 0, lastRms: 0 });
  const [showVadDebug, setShowVadDebug] = useState(false);

  const [currentSpeaker, setCurrentSpeaker] = useState<Speaker>("clinician");
  const currentSpeakerRef = useRef<Speaker>("clinician");
  useEffect(() => { currentSpeakerRef.current = currentSpeaker; }, [currentSpeaker]);
  const structuredSegmentsRef = useRef<StructuredSegment[]>([]);
  const recordingStartMsRef = useRef<number>(0);
  const recordingElapsedMsRef = useRef<number>(0);
  const segmentStartMsRef = useRef<number>(0);
  const lastVoiceMsRef = useRef<number>(0);
  const segmentMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const segmentCyclingRef = useRef<boolean>(false);
  const silenceFlushPendingRef = useRef<boolean>(false);
  const lastSilenceNoticeMsRef = useRef<number>(0);
  const lastBufferNoticeMsRef = useRef<number>(0);
  const currentSegmentIdRef = useRef<number>(-1);
  const segmentPeakLevelsRef = useRef<Map<number, number>>(new Map());
  const segmentTimestampRef = useRef<Map<number, number>>(new Map());
  const segmentControlRef = useRef<{ flush: (reason: "max" | "silence") => void } | null>(null);
  
  const updateAudioLevelRef = useRef<(() => void) | null>(null);
  const backgroundIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pageHiddenRef = useRef<boolean>(document.hidden);
  
  // Transcript state: committedText (stable) + partialText (interim)
  const committedTextRef = useRef<string>(""); // Finalized transcript
  const partialTextRef = useRef<string>(""); // Current interim fragment (not yet finalized)
  const recentLinesRef = useRef<string[]>([]); // Rolling window for dedup (last 20 lines)
  const lastCumulativeTranscriptRef = useRef<string>(""); // Track cumulative transcript for delta extraction
  
  // Backup system - saves transcript to localStorage after each chunk
  const BACKUP_KEY = "docuwhisper_transcript_backup";
  const INFLIGHT_SCRIBE_RECOVERY_KEY = user?.id
    ? `docuwhisper_inflight_scribe_recovery:${user.id}`
    : "docuwhisper_inflight_scribe_recovery";
  const RECOVERABLE_DRAFTS_KEY = user?.id
    ? `docuwhisper_recoverable_drafts:${user.id}`
    : "docuwhisper_recoverable_drafts";
  const [hasBackup, setHasBackup] = useState(false);
  const [interruptedScribeRecovery, setInterruptedScribeRecovery] = useState<InflightScribeRecovery | null>(null);
  const [recoverableDrafts, setRecoverableDrafts] = useState<RecoverableDraft[]>([]);
  const [isRecoverDraftsDialogOpen, setIsRecoverDraftsDialogOpen] = useState(false);
  const [transcriptPanelOpen, setTranscriptPanelOpen] = useState(true);
  const activeDraftIdRef = useRef<string>(resumeNoteId ? `resume:${resumeNoteId}` : crypto.randomUUID());
  const suppressRecoveryPersistenceRef = useRef(false);
  
  const loadRecoverableDrafts = useCallback((): RecoverableDraft[] => {
    try {
      const raw = localStorage.getItem(RECOVERABLE_DRAFTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => ({
          id: typeof item?.id === "string" && item.id.trim() ? item.id : crypto.randomUUID(),
          transcript: typeof item?.transcript === "string" ? item.transcript.trim() : "",
          patientName: typeof item?.patientName === "string" ? item.patientName : "",
          specialty: typeof item?.specialty === "string" ? item.specialty : "general",
          contextText: typeof item?.contextText === "string" ? item.contextText : "",
          savedAt: typeof item?.savedAt === "string" ? item.savedAt : new Date().toISOString(),
          source:
            item?.source === "inflight" ||
            item?.source === "manual_defer" ||
            item?.source === "soap_error"
              ? item.source
              : "backup",
          noteId: typeof item?.noteId === "number" ? item.noteId : null,
          noteTitle: typeof item?.noteTitle === "string" ? item.noteTitle : null,
        }))
        .filter((item) => item.transcript)
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    } catch (error) {
      console.error("[Recovery] Failed to load recoverable drafts:", error);
      return [];
    }
  }, [RECOVERABLE_DRAFTS_KEY]);

  const persistRecoverableDrafts = useCallback((drafts: RecoverableDraft[]) => {
    const nextDrafts = drafts
      .filter((draft) => draft.transcript.trim())
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
      .slice(0, 10);
    localStorage.setItem(RECOVERABLE_DRAFTS_KEY, JSON.stringify(nextDrafts));
    setRecoverableDrafts(nextDrafts);
  }, [RECOVERABLE_DRAFTS_KEY]);

  const saveRecoverableDraft = useCallback((draft: RecoverableDraft) => {
    const existing = loadRecoverableDrafts();
    const nextDraft: RecoverableDraft = {
      ...draft,
      transcript: draft.transcript.trim(),
      savedAt: draft.savedAt || new Date().toISOString(),
    };
    const merged = [nextDraft, ...existing.filter((item) => item.id !== nextDraft.id)];
    persistRecoverableDrafts(merged);
  }, [loadRecoverableDrafts, persistRecoverableDrafts]);

  const removeRecoverableDraft = useCallback((draftId: string) => {
    const nextDrafts = loadRecoverableDrafts().filter((draft) => draft.id !== draftId);
    persistRecoverableDrafts(nextDrafts);
  }, [loadRecoverableDrafts, persistRecoverableDrafts]);

  const saveBackup = useCallback((
    transcript: string,
    patientName: string,
    specialty: string,
    options?: {
      contextText?: string;
      source?: RecoverableDraft["source"];
      noteId?: number | null;
      noteTitle?: string | null;
      draftId?: string;
    },
  ) => {
    if (transcript && transcript.trim()) {
      const draftId = options?.draftId || activeDraftIdRef.current || crypto.randomUUID();
      activeDraftIdRef.current = draftId;
      const backup = {
        id: draftId,
        transcript: transcript.trim(),
        patientName,
        specialty,
        contextText: options?.contextText ?? contextText,
        savedAt: new Date().toISOString(),
        source: options?.source ?? "backup",
        noteId: options?.noteId ?? resumeNoteDataRef.current?.id ?? null,
        noteTitle: options?.noteTitle ?? resumeNoteDataRef.current?.title ?? null,
      };
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
      setHasBackup(true);
      saveRecoverableDraft(backup);
      console.log(`[Backup] Saved ${transcript.length} chars to localStorage`);
    }
  }, [contextText, saveRecoverableDraft]);
  
  const loadBackup = useCallback(() => {
    try {
      const saved = localStorage.getItem(BACKUP_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.transcript === "string" && parsed.transcript.trim()) {
          return parsed as Partial<RecoverableDraft> & { transcript: string };
        }
      }
    } catch (e) {
      console.error("[Backup] Failed to load:", e);
    }
    return null;
  }, []);
  
  const clearBackup = useCallback(() => {
    localStorage.removeItem(BACKUP_KEY);
    setHasBackup(false);
  }, []);

  const saveInflightScribeRecovery = useCallback((payload: InflightScribeRecovery) => {
    if (!payload.transcript.trim()) return;
    const nextPayload: InflightScribeRecovery = {
      ...payload,
      id: payload.id || activeDraftIdRef.current,
      noteId: payload.noteId ?? resumeNoteDataRef.current?.id ?? null,
      noteTitle: payload.noteTitle ?? resumeNoteDataRef.current?.title ?? null,
    };
    localStorage.setItem(INFLIGHT_SCRIBE_RECOVERY_KEY, JSON.stringify(nextPayload));
    saveRecoverableDraft({
      id: nextPayload.id || activeDraftIdRef.current,
      transcript: nextPayload.transcript,
      patientName: nextPayload.patientName,
      specialty: "general",
      contextText: nextPayload.contextText,
      savedAt: nextPayload.savedAt,
      source: "inflight",
      noteId: nextPayload.noteId ?? null,
      noteTitle: nextPayload.noteTitle ?? null,
    });
  }, [INFLIGHT_SCRIBE_RECOVERY_KEY, saveRecoverableDraft]);

  const loadInflightScribeRecovery = useCallback((): InflightScribeRecovery | null => {
    try {
      const raw = localStorage.getItem(INFLIGHT_SCRIBE_RECOVERY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<InflightScribeRecovery>;
      if (!parsed || typeof parsed.transcript !== "string" || !parsed.transcript.trim()) {
        return null;
      }
      return {
        id: typeof parsed.id === "string" ? parsed.id : undefined,
        transcript: parsed.transcript,
        patientName: typeof parsed.patientName === "string" ? parsed.patientName : "",
        contextText: typeof parsed.contextText === "string" ? parsed.contextText : "",
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
        reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
        noteId: typeof parsed.noteId === "number" ? parsed.noteId : null,
        noteTitle: typeof parsed.noteTitle === "string" ? parsed.noteTitle : null,
      };
    } catch (error) {
      console.error("[Recovery] Failed to parse interrupted scribe payload:", error);
      return null;
    }
  }, [INFLIGHT_SCRIBE_RECOVERY_KEY]);

  const clearInflightScribeRecovery = useCallback(() => {
    localStorage.removeItem(INFLIGHT_SCRIBE_RECOVERY_KEY);
    setInterruptedScribeRecovery(null);
  }, [INFLIGHT_SCRIBE_RECOVERY_KEY]);

  const clearDraftRecoveryById = useCallback((draftId?: string | null) => {
    if (!draftId) return;

    removeRecoverableDraft(draftId);

    const backup = loadBackup();
    if (backup?.id === draftId) {
      clearBackup();
    }

    const inflight = loadInflightScribeRecovery();
    if (inflight?.id === draftId) {
      clearInflightScribeRecovery();
    }

    if (activeDraftIdRef.current === draftId) {
      activeDraftIdRef.current = crypto.randomUUID();
    }
  }, [clearBackup, clearInflightScribeRecovery, loadBackup, loadInflightScribeRecovery, removeRecoverableDraft]);

  const clearDraftRecoveryAfterSuccessfulSave = useCallback(
    (options: { draftId?: string | null; transcript?: string | null; noteId?: number | null }) => {
      const matchesRecovery = (draft: {
        id?: string | null;
        noteId?: number | null;
        transcript?: string | null;
      }) => {
        if (options.draftId && draft.id === options.draftId) {
          return true;
        }

        if (options.noteId != null && draft.noteId === options.noteId) {
          return true;
        }

        if (
          options.transcript &&
          draft.noteId == null &&
          recoveryTranscriptsMatch(draft.transcript || "", options.transcript)
        ) {
          return true;
        }

        return false;
      };

      const nextDrafts = loadRecoverableDrafts().filter((draft) => !matchesRecovery(draft));
      persistRecoverableDrafts(nextDrafts);

      const backup = loadBackup();
      if (
        backup?.transcript &&
        matchesRecovery({
          id: typeof backup.id === "string" ? backup.id : null,
          noteId: typeof backup.noteId === "number" ? backup.noteId : null,
          transcript: backup.transcript,
        })
      ) {
        clearBackup();
      }

      const inflight = loadInflightScribeRecovery();
      if (
        inflight?.transcript &&
        matchesRecovery({
          id: inflight.id ?? null,
          noteId: inflight.noteId ?? null,
          transcript: inflight.transcript,
        })
      ) {
        clearInflightScribeRecovery();
      }

      if (options.draftId && activeDraftIdRef.current === options.draftId) {
        activeDraftIdRef.current = crypto.randomUUID();
      }

      suppressRecoveryPersistenceRef.current = true;
    },
    [
      clearBackup,
      clearInflightScribeRecovery,
      loadBackup,
      loadInflightScribeRecovery,
      loadRecoverableDrafts,
      persistRecoverableDrafts,
    ],
  );
  
  // Check for existing backup on mount
  useEffect(() => {
    const backup = loadBackup();
    if (backup && backup.transcript) {
      setHasBackup(true);
    }
  }, [loadBackup]);

  useEffect(() => {
    const inflight = loadInflightScribeRecovery();
    if (inflight) {
      setInterruptedScribeRecovery(inflight);
    }
  }, [loadInflightScribeRecovery]);

  useEffect(() => {
    setRecoverableDrafts(loadRecoverableDrafts());
  }, [loadRecoverableDrafts]);

  useEffect(() => {
    if (recoverableDrafts.length === 0) return;

    let cancelled = false;

    void (async () => {
      try {
        const response = await apiRequest("GET", "/api/notes");
        const notes = (await response.json()) as Array<{ id?: number; transcript?: string | null }>;
        if (cancelled || !Array.isArray(notes) || notes.length === 0) return;

        const noteIds = new Set(
          notes
            .map((note) => (typeof note.id === "number" ? note.id : null))
            .filter((id): id is number => id !== null),
        );
        const isSavedDraft = (draft: {
          noteId?: number | null;
          transcript?: string | null;
        }) => {
          if (draft.noteId != null && noteIds.has(draft.noteId)) {
            return true;
          }

          return notes.some((note) => recoveryTranscriptsMatch(draft.transcript || "", note.transcript || ""));
        };

        const nextDrafts = recoverableDrafts.filter((draft) => !isSavedDraft(draft));
        if (nextDrafts.length === recoverableDrafts.length || cancelled) return;

        persistRecoverableDrafts(nextDrafts);

        const backup = loadBackup();
        if (backup && isSavedDraft(backup)) {
          clearBackup();
        }

        const inflight = loadInflightScribeRecovery();
        if (inflight && isSavedDraft(inflight)) {
          clearInflightScribeRecovery();
        }
      } catch (error) {
        console.error("[Recovery] Failed to prune stale recoverable drafts:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    clearBackup,
    clearInflightScribeRecovery,
    loadBackup,
    loadInflightScribeRecovery,
    persistRecoverableDrafts,
    recoverableDrafts,
  ]);

  // Load existing note data when in resume mode
  useEffect(() => {
    if (resumeNoteId) {
      const fetchNote = async () => {
        try {
          const response = await apiRequest("GET", `/api/notes/${resumeNoteId}`);
          const note = await response.json();
          const noteData = {
            id: note.id,
            title: note.title,
            transcript: note.transcript || "",
            patientName: note.patientName,
            patientContext: note.patientContext,
            icdCodes: note.icdCodes,
            soapSourceHash: note.soapSourceHash ?? null,
            soapStale: Boolean(note.soapStale),
          };
          activeDraftIdRef.current = `resume:${note.id}`;
          setResumeNoteData(noteData);
          // Update refs for async callbacks
          resumeNoteDataRef.current = noteData;
          isResumeModeRef.current = true;
          
          // Pre-populate fields
          if (note.patientName) setPatientName(note.patientName);
          if (note.patientContext) setContextText(note.patientContext);
          // Show existing transcript
          if (note.transcript) {
            addTranscriptEntry("--- Previous transcript ---", "system");
            addTranscriptEntry(note.transcript, "content");
            committedTextRef.current = note.transcript;
            addTranscriptEntry("--- Recording new audio below ---", "system");
          }
          toast({
            title: "Resuming session",
            description: `Adding more to "${note.title}"`,
          });
          
          // Auto-start recording if autoStart param is set
          if (autoStartRecording && !hasAutoStartedRef.current) {
            hasAutoStartedRef.current = true;
            // Small delay to ensure everything is initialized
            setTimeout(() => {
              startRecordingRef.current?.();
            }, 500);
          }
        } catch (error) {
          console.error("Failed to load note for resume:", error);
          toast({
            title: "Failed to load note",
            description: "Starting a new session instead.",
            variant: "destructive",
          });
          setIsResumeMode(false);
          isResumeModeRef.current = false;
        }
      };
      fetchNote();
    }
  }, [resumeNoteId, autoStartRecording]);

  // Enumerate available microphones
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        // Request permission first to get device labels
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          stream.getTracks().forEach(track => track.stop());
        });
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(device => device.kind === "audioinput");
        setAvailableMicrophones(mics);
        
        // Set default microphone if not already selected
        if (!selectedMicrophoneId && mics.length > 0) {
          setSelectedMicrophoneId(mics[0].deviceId);
        }
      } catch (error) {
        console.error("Failed to enumerate audio devices:", error);
      }
    };

    enumerateDevices();

    // Listen for device changes (plugging in/out microphones)
    navigator.mediaDevices.addEventListener("devicechange", enumerateDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", enumerateDevices);
    };
  }, [selectedMicrophoneId]);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const { data: transcriptionProvider } = useQuery<TranscriptionProviderStatus>({
    queryKey: ["/api/transcription-provider"],
    refetchInterval: 30_000,
  });

  // Fetch user settings for language preference and noise threshold
  const { data: userSettings } = useQuery<{
    language?: string;
    autoSaveEnabled?: boolean;
    defaultTemplateId?: number;
    transcriptionMode?: string;
    noiseThreshold?: number;
  }>({
    queryKey: ["/api/settings"],
  });

  // Get language from settings (default to English)
  const transcriptionLanguage = userSettings?.language || "en";
  
  // Get noise threshold from settings (default to 10%)
  const noiseThreshold = userSettings?.noiseThreshold ?? 15; // Default 15% to reduce hallucinations on quiet audio
  const transcriptionConfig = getTranscriptionConfig(userSettings?.transcriptionMode);
  const minSegmentMs = transcriptionConfig.minSec * 1000;
  const maxSegmentMs = transcriptionConfig.maxSec * 1000;
  const silenceFlushMs = transcriptionConfig.silenceSec * 1000;

  // Set the user's default template when settings are loaded (only on initial load)
  const hasInitializedTemplateRef = useRef(false);
  useEffect(() => {
    // Only initialize once and only if still on "default"
    if (hasInitializedTemplateRef.current || selectedTemplateId !== "default") {
      return;
    }
    
    // First priority: user settings defaultTemplateId
    if (userSettings?.defaultTemplateId) {
      // Verify this template still exists
      const templateExists = templates?.some(t => t.id === userSettings.defaultTemplateId);
      if (templateExists) {
        setSelectedTemplateId(userSettings.defaultTemplateId.toString());
        hasInitializedTemplateRef.current = true;
        return;
      }
    }
    
    // Second priority: find template with isDefault = true
    if (templates && templates.length > 0) {
      const defaultTemplate = templates.find(t => t.isDefault === true);
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id.toString());
        hasInitializedTemplateRef.current = true;
        return;
      }
    }
  }, [userSettings?.defaultTemplateId, templates, selectedTemplateId]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const normalizeVisitTimeMinutes = (value: unknown): number | undefined => {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number.parseInt(value, 10)
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }
    return Math.round(parsed);
  };

  const extractVisitTimeMinutesFromPayload = (payload: unknown): number | undefined => {
    if (!payload) return undefined;
    let parsedPayload: unknown = payload;

    if (typeof payload === "string") {
      try {
        parsedPayload = JSON.parse(payload);
      } catch {
        return undefined;
      }
    }

    if (!parsedPayload || typeof parsedPayload !== "object") return undefined;
    const source = parsedPayload as Record<string, unknown>;
    return (
      normalizeVisitTimeMinutes(source.visitTimeMinutes) ??
      normalizeVisitTimeMinutes(source.timeSpentMinutes) ??
      normalizeVisitTimeMinutes(source.billableTimeMinutes)
    );
  };

  const resolveRequestedTemplateId = (templateValue?: string) => {
    if (!templateValue || templateValue === "default" || templateValue === "none") {
      return undefined;
    }

    const parsed = Number.parseInt(templateValue, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const buildIcdCodesWithVisitTime = (
    icdCodesPayload: any,
    sessionDurationSeconds?: number,
    priorVisitMinutes?: number,
  ) => {
    const recordedMinutes =
      typeof sessionDurationSeconds === "number" && sessionDurationSeconds > 0
        ? Math.max(1, Math.round(sessionDurationSeconds / 60))
        : undefined;
    const payloadObject =
      icdCodesPayload && typeof icdCodesPayload === "object" ? icdCodesPayload : undefined;
    const payloadMinutes =
      normalizeVisitTimeMinutes(payloadObject?.visitTimeMinutes) ??
      normalizeVisitTimeMinutes(payloadObject?.timeSpentMinutes) ??
      normalizeVisitTimeMinutes(payloadObject?.billableTimeMinutes);
    const baseMinutes = payloadMinutes ?? recordedMinutes;
    const cumulativeMinutes =
      (typeof priorVisitMinutes === "number" ? priorVisitMinutes : 0) + (baseMinutes ?? 0);

    if (!payloadObject) {
      return cumulativeMinutes > 0 ? { visitTimeMinutes: cumulativeMinutes } : null;
    }

    return {
      ...payloadObject,
      ...(cumulativeMinutes > 0
        ? { visitTimeMinutes: cumulativeMinutes }
        : {}),
    };
  };

  const parseStoredIcdCodes = (payload: unknown) => {
    if (!payload) return null;
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload);
      } catch {
        return null;
      }
    }
    return typeof payload === "object" ? payload : null;
  };

  const buildNoteSectionsFromSoap = (soapPayload: {
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
    hpi?: string;
  }) => {
    if (soapPayload?.hpi) {
      return {
        subjective: soapPayload.hpi,
        objective: "",
        assessment: "",
        plan: soapPayload.plan || "",
      };
    }

    return {
      subjective: soapPayload?.subjective || "",
      objective: soapPayload?.objective || "",
      assessment: soapPayload?.assessment || "",
      plan: soapPayload?.plan || "",
    };
  };

  const getUsableSpeakerSegments = useCallback(
    (transcript: string, segments?: StructuredSegment[]) => {
      if (!segments || segments.length === 0) {
        return undefined;
      }

      const normalizedTranscript = normalizeSpeakerCoverageText(transcript);
      if (!normalizedTranscript) {
        return undefined;
      }

      const normalizedSegmentTranscript = normalizeSpeakerCoverageText(
        segments
          .map((segment) => segment.text)
          .filter((text) => typeof text === "string" && text.trim().length > 0)
          .join(" "),
      );

      if (!normalizedSegmentTranscript) {
        return undefined;
      }

      return normalizedSegmentTranscript === normalizedTranscript ? segments : undefined;
    },
    [],
  );

  const upsertSavedNoteInCache = useCallback(
    (savedNote: SessionSavedNote | null | undefined) => {
      if (!savedNote || typeof savedNote.id !== "number") {
        return;
      }

      const noteQueryKeys: Array<[string, string | number]> = [
        ["/api/notes", savedNote.id.toString()],
        ["/api/notes", savedNote.id],
      ];

      for (const queryKey of noteQueryKeys) {
        queryClient.setQueryData(queryKey, savedNote);
      }

      queryClient.setQueryData<SessionSavedNote[] | undefined>(["/api/notes"], (existing) => {
        if (!existing) {
          return [savedNote];
        }

        const existingIndex = existing.findIndex((note) => note.id === savedNote.id);
        if (existingIndex === -1) {
          return [savedNote, ...existing];
        }

        const next = [...existing];
        next[existingIndex] = {
          ...next[existingIndex],
          ...savedNote,
        };
        return next;
      });
    },
    [queryClient],
  );

  const saveResumeTranscriptDraft = async (params: {
    resumeNote: ResumeNoteData;
    transcript: string;
    patientName?: string;
    contextText?: string;
  }) => {
    const response = await apiRequest("PATCH", `/api/notes/${params.resumeNote.id}`, {
      transcript: params.transcript,
      patientName: params.patientName || null,
      patientContext: params.contextText || null,
    });
    return response.json();
  };

  const saveTranscriptOnlyDraftNote = async (params: {
    transcript: string;
    patientName?: string;
    contextText?: string;
  }) => {
    const response = await apiRequest("POST", "/api/notes", {
      title: getChiefComplaintPreview(params.transcript) || getFallbackTitle(params.patientName),
      patientName: params.patientName || null,
      specialty: "general",
      transcript: params.transcript,
      patientContext: params.contextText || null,
    });
    return response.json();
  };

  const addTranscriptEntry = (text: string, type: "system" | "content" = "system", recordingTimeSec?: number) => {
    let timestamp: string;
    if (recordingTimeSec !== undefined) {
      // Show recording position like "0:00", "0:40", "1:20"
      timestamp = formatTime(recordingTimeSec);
    } else {
      // Show clock time for system messages
      const now = new Date();
      timestamp = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }) + " " + now.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
    }
    
    setTranscriptEntries((prev) => [...prev, { timestamp, text, type }]);
  };

  const importTranscriptToCurrentSession = useCallback(
    (
      transcript: string,
      options?: {
        sourceLabel?: string;
        patientName?: string;
        patientContext?: string;
      }
    ) => {
      const cleaned = transcript.trim();
      if (!cleaned) {
        toast({
          title: "Transcript is empty",
          description: "Paste transcript text before importing.",
          variant: "destructive",
        });
        return false;
      }

      if (options?.patientName && !patientName.trim()) {
        setPatientName(options.patientName);
      }
      if (options?.patientContext && !contextText.trim()) {
        setContextText(options.patientContext);
      }

      const systemLabel = options?.sourceLabel
        ? `--- Imported transcript (${options.sourceLabel}) ---`
        : "--- Imported transcript ---";
      addTranscriptEntry(systemLabel, "system");
      addTranscriptEntry(cleaned, "content");

      committedTextRef.current = committedTextRef.current.trim()
        ? `${committedTextRef.current.trim()}\n\n${cleaned}`
        : cleaned;

      saveBackup(committedTextRef.current, options?.patientName || patientName, "general");
      setActiveTab("transcript");

      toast({
        title: "Transcript imported",
        description: "You can now generate SOAP or continue recording.",
      });

      return true;
    },
    [addTranscriptEntry, contextText, patientName, saveBackup, toast]
  );

  useEffect(() => {
    if (!isNewSession || !importNoteId || hasImportedFromNoteRef.current) {
      return;
    }

    hasImportedFromNoteRef.current = true;

    const importFromExistingNote = async () => {
      try {
        const response = await apiRequest("GET", `/api/notes/${importNoteId}`);
        const note = await response.json();
        const transcript =
          typeof note?.transcript === "string" ? note.transcript.trim() : "";

        if (!transcript) {
          toast({
            title: "No transcript found",
            description: "This note does not contain transcript text to import.",
            variant: "destructive",
          });
          return;
        }

        importTranscriptToCurrentSession(transcript, {
          sourceLabel: note?.title || `note ${importNoteId}`,
          patientName: typeof note?.patientName === "string" ? note.patientName : undefined,
          patientContext:
            typeof note?.patientContext === "string" ? note.patientContext : undefined,
        });
      } catch (error) {
        console.error("Failed to import transcript from note:", error);
        hasImportedFromNoteRef.current = false;
        toast({
          title: "Import failed",
          description: "Could not load transcript from that note.",
          variant: "destructive",
        });
      } finally {
        navigate("/session/new");
      }
    };

    void importFromExistingNote();
  }, [importNoteId, importTranscriptToCurrentSession, isNewSession, navigate, toast]);

  type TranscribeResult =
    | {
        ok: true;
        transcript: string;
        chunk_id: number;
        session_id: string;
        provider?: "local" | "openai";
        fallback_used?: boolean;
      }
    | { ok: false; error: "api_error" | "timeout" | "network" };

  const transcribeChunk = async (
    audioBlob: Blob,
    chunkId: number,
    options?: { maxRetries?: number; sessionId?: string; language?: string },
  ): Promise<TranscribeResult> => {
    const maxRetries = options?.maxRetries ?? 2;
    const sessionId = options?.sessionId ?? recordingSessionIdRef.current;
    const language = options?.language ?? transcriptionLanguage;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      const requestStartedAt = Date.now();
      
      try {
        const formData = new FormData();
        formData.append("audio", audioBlob, "chunk.webm");
        formData.append("language", language);
        formData.append("chunk_id", String(chunkId));
        formData.append("session_id", sessionId);
        formData.append("retry_attempt", String(attempt));
        formData.append("max_retries", String(maxRetries));

        console.log(`[transcribeChunk] chunk_id=${chunkId} session=${sessionId.slice(0,8)} attempt ${attempt + 1}/${maxRetries + 1}, ${audioBlob.size} bytes`);
        
        dispatchActivityEvent();
        
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
          credentials: "include",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        
        if (!response.ok) {
          console.error(`[transcribeChunk] Failed with status ${response.status} (attempt ${attempt + 1})`);
          console.log(
            "[transcribe-chunk-metric]",
            JSON.stringify({
              event: "error",
              chunk_id: chunkId,
              session_id: sessionId,
              error_type: "api_error",
              status_code: response.status,
              retry_attempt: attempt,
              max_retries: maxRetries,
              latency_ms: Date.now() - requestStartedAt,
              audio_bytes: audioBlob.size,
            }),
          );
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            continue;
          }
          return { ok: false, error: "api_error" };
        }

        const data = await response.json();
        console.log(`[transcribeChunk] chunk_id=${data.chunk_id} completed, got ${data.text?.length || data.transcript?.length || 0} chars`);
        console.log(
          "[transcribe-chunk-metric]",
          JSON.stringify({
            event: "success",
            chunk_id: data.chunk_id ?? chunkId,
            session_id: data.session_id ?? sessionId,
            provider: typeof data.provider === "string" ? data.provider : "unknown",
            fallback_used: Boolean(data.fallback_used),
            retry_attempt: attempt,
            max_retries: maxRetries,
            latency_ms: Date.now() - requestStartedAt,
            audio_bytes: audioBlob.size,
          }),
        );
        
        dispatchActivityEvent();
        
        return {
          ok: true,
          transcript: data.text || data.transcript || "",
          chunk_id: data.chunk_id ?? chunkId,
          session_id: data.session_id ?? sessionId,
          provider: data.provider === "local" || data.provider === "openai" ? data.provider : undefined,
          fallback_used: Boolean(data.fallback_used),
        };
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        const isTimeout = error instanceof Error && error.name === 'AbortError';
        console.error(`[transcribeChunk] ${isTimeout ? 'Timeout' : 'Error'} (attempt ${attempt + 1}):`, isTimeout ? '' : error);
        console.log(
          "[transcribe-chunk-metric]",
          JSON.stringify({
            event: "error",
            chunk_id: chunkId,
            session_id: sessionId,
            error_type: isTimeout ? "timeout" : "network",
            retry_attempt: attempt,
            max_retries: maxRetries,
            latency_ms: Date.now() - requestStartedAt,
            audio_bytes: audioBlob.size,
          }),
        );
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        return { ok: false, error: isTimeout ? "timeout" : "network" };
      }
    }
    return { ok: false, error: "network" };
  };

  // Normalize text: lowercase, collapse whitespace, remove punctuation for comparison
  const normalize = (text: string): string => {
    return text.trim().toLowerCase().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ');
  };
  
  // Check if chunk is an exact duplicate (not substring - that's too aggressive)
  const isInDeduplicationWindow = (line: string): boolean => {
    const normLine = normalize(line);
    // Short or empty text should be added, not dropped
    if (!normLine || normLine.length < 5) return false;
    
    // Only check for EXACT match in rolling window
    // Each 15-second chunk is independent audio with unique content
    // We only want to prevent processing the same chunk twice
    for (const recentLine of recentLinesRef.current) {
      if (normalize(recentLine) === normLine) {
        console.log("[Dedup] Exact duplicate found");
        return true;
      }
    }
    
    // NO substring checking - removed because it drops legitimate content
    // Independent audio chunks should have unique content
    return false;
  };
  
  // Finalize current partial into committed text
  const finalizePartial = () => {
    const partial = partialTextRef.current.trim();
    if (partial) {
      committedTextRef.current += (committedTextRef.current ? " " : "") + partial;
      partialTextRef.current = "";
    }
  };
  
  // Process new transcript: either delta append or partial replacement
  // Returns the processed text if successful, null if duplicate/empty
  const processTranscriptUpdate = (newText: string, isPartial: boolean = false): string | null => {
    const trimmed = newText.trim();
    if (!trimmed) return null;
    
    if (isPartial) {
      // Replace partial text (interim updates)
      partialTextRef.current = trimmed;
      console.log("[Transcript] Partial update:", trimmed.substring(0, 50) + "...");
      return trimmed;
    }
    
    // This is finalized content (delta) - check for duplicates
    if (isInDeduplicationWindow(trimmed)) {
      console.log("[Dedup] Dropping duplicate:", trimmed.substring(0, 50) + "...");
      return null;
    }
    
    // Finalize any pending partial first
    finalizePartial();
    
    // Add to committed text
    committedTextRef.current += (committedTextRef.current ? " " : "") + trimmed;
    
    // Update rolling window (last 20 lines)
    recentLinesRef.current.push(trimmed);
    if (recentLinesRef.current.length > 20) {
      recentLinesRef.current.shift();
    }
    
    return trimmed;
  };
  
  // For chunk-based transcription (each chunk is independent, not partial)
  const addTranscriptContent = (newText: string, recordingTimeSec?: number): boolean => {
    const processedText = processTranscriptUpdate(newText, false);
    if (processedText) {
      addTranscriptEntry(processedText, "content", recordingTimeSec);
      console.log("[Dedup] Added:", processedText.substring(0, 50) + "...");
      return true;
    }
    return false;
  };

  const getRecordingTimestampSec = (segmentStartMs: number) => {
    const activeStart = recordingStartMsRef.current || segmentStartMs;
    const elapsedMs = recordingElapsedMsRef.current + Math.max(0, segmentStartMs - activeStart);
    return Math.max(0, Math.floor(elapsedMs / 1000));
  };

  const flushOrderedChunks = () => {
    const ordered = orderedChunksRef.current;
    let nextId = nextExpectedChunkIdRef.current;
    let flushedAny = false;

    while (ordered.has(nextId) || droppedChunksRef.current.has(nextId)) {
      if (droppedChunksRef.current.has(nextId)) {
        nextId++;
        continue;
      }
      const entry = ordered.get(nextId)!;
      if (entry.text.trim()) {
        const added = addTranscriptContent(entry.text, entry.timestampSec);
        console.log(`[OrderedAssembly] chunk_id=${nextId} flushed [${entry.speaker}] (${entry.text.length} chars): ${added ? 'ADDED' : 'DEDUPED'}`);
        if (added) {
          flushedAny = true;
          structuredSegmentsRef.current.push({
            speaker: entry.speaker,
            text: entry.text.trim(),
            chunk_id: nextId,
            timestamp: entry.timestampSec,
          });
        }
      } else {
        console.log(`[OrderedAssembly] chunk_id=${nextId} flushed (silence)`);
      }
      ordered.delete(nextId);
      nextId++;
    }

    nextExpectedChunkIdRef.current = nextId;
    if (flushedAny) {
      saveBackup(committedTextRef.current, patientName, "general");
    }
  };

  const processNextChunk = async () => {
    const activeSessionId = recordingSessionIdRef.current;
    const chunkItem = pendingChunksRef.current.find(c => !c.processed);
    const pendingCount = pendingChunksRef.current.length;
    const unprocessedCount = pendingChunksRef.current.filter(c => !c.processed).length;
    console.log(`[processNextChunk] Called. Pending: ${pendingCount}, Unprocessed: ${unprocessedCount}, isTranscribing: ${isTranscribingRef.current}`);
    const releaseTranscribeLock = () => {
      if (transcribeLockSessionRef.current === activeSessionId) {
        transcribeLockSessionRef.current = null;
        isTranscribingRef.current = false;
      }
    };
    
    if (!chunkItem) {
      console.log("[Chunk] No unprocessed chunks remaining");
      return;
    }
    if (isTranscribingRef.current) {
      if (transcribeLockSessionRef.current && transcribeLockSessionRef.current !== activeSessionId) {
        console.log("[Chunk] Clearing stale transcription lock for prior session");
        transcribeLockSessionRef.current = null;
        isTranscribingRef.current = false;
      } else {
        console.log(`[Chunk] Already transcribing, chunk ${chunkItem.id} will be picked up when current finishes`);
        return;
      }
    }

    if (processedChunkIdsRef.current.has(chunkItem.id)) {
      console.log(`[Chunk ${chunkItem.id}] Already in processed set, skipping (dedup)`);
      chunkItem.processed = true;
      processNextChunk();
      return;
    }

    if (chunkItem.peakLevel < noiseThreshold) {
      console.log(`[Chunk ${chunkItem.id}] Skipped - peak level ${chunkItem.peakLevel.toFixed(1)}% below threshold ${noiseThreshold}%`);
      chunkItem.processed = true;
      processedChunkIdsRef.current.add(chunkItem.id);
      orderedChunksRef.current.set(chunkItem.id, { text: "", timestampSec: chunkItem.timestampSec, speaker: chunkItem.speaker });
      flushOrderedChunks();
      const remaining = pendingChunksRef.current.filter(c => !c.processed);
      if (remaining.length > 0) {
        processNextChunk();
      }
      return;
    }

    isTranscribingRef.current = true;
    transcribeLockSessionRef.current = activeSessionId;
    processedChunkIdsRef.current.add(chunkItem.id);
    
    console.log(`[Chunk ${chunkItem.id}] Processing ${chunkItem.blob.size} bytes (peak: ${chunkItem.peakLevel.toFixed(1)}%, rms: ${chunkItem.rmsMax.toFixed(4)}, speaker: ${chunkItem.speaker})...`);
    
    try {
      const result = await transcribeChunk(chunkItem.blob, chunkItem.id, {
        sessionId: activeSessionId,
        language: transcriptionLanguage,
      });

      // Ignore late responses from a previous recording session.
      if (activeSessionId !== recordingSessionIdRef.current) {
        console.log(`[Chunk ${chunkItem.id}] Ignored - session changed`);
        chunkItem.processed = true;
        releaseTranscribeLock();
        return;
      }
      
      if (result.ok) {
        if (orderedChunksRef.current.has(result.chunk_id)) {
          console.log(`[Chunk ${result.chunk_id}] Duplicate response ignored`);
        } else {
          orderedChunksRef.current.set(result.chunk_id, { text: result.transcript.trim(), timestampSec: chunkItem.timestampSec, speaker: chunkItem.speaker });
          console.log(`[Chunk ${result.chunk_id}] Stored in ordered map, next expected: ${nextExpectedChunkIdRef.current}`);
          flushOrderedChunks();
        }
      } else {
        const errorMsg = result.error === "timeout" ? "timed out" : result.error === "api_error" ? "server error" : "network error";
        console.error(`[Chunk ${chunkItem.id}] Transcription failed: ${errorMsg}`);
        droppedChunksRef.current.add(chunkItem.id);
        addTranscriptEntry(`[Chunk ${chunkItem.id} dropped — ${errorMsg}]`);
        flushOrderedChunks();
      }
    } catch (err) {
      if (activeSessionId !== recordingSessionIdRef.current) {
        console.log(`[Chunk ${chunkItem.id}] Error ignored - session changed`);
        chunkItem.processed = true;
        releaseTranscribeLock();
        return;
      }
      console.error(`[Chunk ${chunkItem.id}] Transcription error:`, err);
      droppedChunksRef.current.add(chunkItem.id);
      addTranscriptEntry(`[Chunk ${chunkItem.id} dropped]`);
      flushOrderedChunks();
    }

    chunkItem.processed = true;
    releaseTranscribeLock();
    
    const remaining = pendingChunksRef.current.filter(c => !c.processed);
    console.log(`[Chunk] ${remaining.length} chunks remaining to process`);
    if (remaining.length > 0 && activeSessionId === recordingSessionIdRef.current) {
      processNextChunk();
    }
  };

  const queueChunkForTranscription = (segmentBlob: Blob, segmentId: number, segmentStartMs: number) => {
    const timestampSec =
      segmentTimestampRef.current.get(segmentId) ?? getRecordingTimestampSec(segmentStartMs);
    segmentTimestampRef.current.delete(segmentId);
    const peakLevel = segmentPeakLevelsRef.current.get(segmentId) ?? 0;
    segmentPeakLevelsRef.current.delete(segmentId);
    const rmsMax = segmentRmsMaxRef.current.get(segmentId) ?? 0;
    segmentRmsMaxRef.current.delete(segmentId);
    const speechFrames = segmentSpeechFramesRef.current.get(segmentId) ?? 0;
    segmentSpeechFramesRef.current.delete(segmentId);
    const speaker = currentSpeakerRef.current;

    const passesVad = rmsMax >= VAD_RMS_THRESHOLD && speechFrames >= MIN_SPEECH_FRAMES;

    if (!passesVad) {
      console.log(`[VAD] Chunk ${segmentId} DROPPED — rmsMax=${rmsMax.toFixed(4)}, speechFrames=${speechFrames} (threshold: rms>=${VAD_RMS_THRESHOLD}, frames>=${MIN_SPEECH_FRAMES})`);
      orderedChunksRef.current.set(segmentId, { text: "", timestampSec, speaker });
      flushOrderedChunks();
      setVadStats(prev => ({ ...prev, dropped: prev.dropped + 1, lastRms: rmsMax }));
      return;
    }

    console.log(`[VAD] Chunk ${segmentId} PASSED — rmsMax=${rmsMax.toFixed(4)}, speechFrames=${speechFrames}`);
    setVadStats(prev => ({ ...prev, uploaded: prev.uploaded + 1, lastRms: rmsMax }));

    const chunkItem: ChunkItem = {
      id: segmentId,
      blob: segmentBlob,
      processed: false,
      timestampSec,
      peakLevel,
      rmsMax,
      speechFrames,
      speaker,
    };

    pendingChunksRef.current.push(chunkItem);
    console.log(`[Chunk ${segmentId}] Queued segment at ${formatTime(timestampSec)} (${segmentBlob.size} bytes, peak: ${peakLevel.toFixed(1)}%, rms: ${rmsMax.toFixed(4)}, speaker: ${speaker})`);

    const pendingUnprocessed = pendingChunksRef.current.filter(c => !c.processed).length;
    const now = Date.now();
    if (pendingUnprocessed > 2 && now - lastBufferNoticeMsRef.current > 8000) {
      addTranscriptEntry("Buffering audio... transcription will catch up");
      lastBufferNoticeMsRef.current = now;
    }

    processNextChunk();
  };

  const updateAudioLevel = useCallback(() => {
    if (analyserRef.current && isRecordingRef.current) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const levels = [];
      const chunkSize = Math.floor(dataArray.length / 5);
      for (let i = 0; i < 5; i++) {
        const chunk = dataArray.slice(i * chunkSize, (i + 1) * chunkSize);
        const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
        levels.push(Math.min(avg / 128, 1));
      }
      setAudioLevel(levels);
      setGlobalAudioLevel(levels);
      
      const currentMax = Math.max(...levels) * 100;
      const currentSegmentId = currentSegmentIdRef.current;
      if (currentSegmentId >= 0) {
        const prevPeak = segmentPeakLevelsRef.current.get(currentSegmentId) ?? 0;
        if (currentMax > prevPeak) {
          segmentPeakLevelsRef.current.set(currentSegmentId, currentMax);
        }
      }

      const timeDomain = new Uint8Array(analyserRef.current.fftSize);
      analyserRef.current.getByteTimeDomainData(timeDomain);
      let sumSq = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const sample = (timeDomain[i] - 128) / 128;
        sumSq += sample * sample;
      }
      const rms = Math.sqrt(sumSq / timeDomain.length);

      if (currentSegmentId >= 0) {
        const prevRms = segmentRmsMaxRef.current.get(currentSegmentId) ?? 0;
        if (rms > prevRms) {
          segmentRmsMaxRef.current.set(currentSegmentId, rms);
        }
        if (rms >= VAD_RMS_THRESHOLD) {
          const prev = segmentSpeechFramesRef.current.get(currentSegmentId) ?? 0;
          segmentSpeechFramesRef.current.set(currentSegmentId, prev + 1);
        }
      }

      const now = Date.now();
      if (currentMax > noiseThreshold) {
        lastVoiceMsRef.current = now;
        silenceFlushPendingRef.current = false;
      } else if (
        segmentStartMsRef.current > 0 &&
        now - segmentStartMsRef.current >= minSegmentMs &&
        now - lastVoiceMsRef.current >= silenceFlushMs &&
        !silenceFlushPendingRef.current
      ) {
        silenceFlushPendingRef.current = true;
        if (now - lastSilenceNoticeMsRef.current > 5000) {
          addTranscriptEntry("Silence detected — sending buffered audio...");
          lastSilenceNoticeMsRef.current = now;
        }
        segmentControlRef.current?.flush("silence");
      }
      
      if (now - lastActivityDispatchRef.current > 30000) {
        lastActivityDispatchRef.current = now;
        dispatchActivityEvent();
      }
      
      if (!pageHiddenRef.current) {
        animationRef.current = requestAnimationFrame(() => {
          updateAudioLevelRef.current?.();
        });
      }
    }
  }, [addTranscriptEntry, minSegmentMs, noiseThreshold, setAudioLevel, setGlobalAudioLevel, silenceFlushMs]);
  
  updateAudioLevelRef.current = updateAudioLevel;

  const startBackgroundInterval = useCallback(() => {
    if (backgroundIntervalRef.current) return;
    backgroundIntervalRef.current = setInterval(() => {
      if (!isRecordingRef.current) return;
      const ctx = audioContextRef.current;
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      updateAudioLevelRef.current?.();
    }, 500);
    console.log("[Background] Started background audio monitoring interval");
  }, []);

  const stopBackgroundInterval = useCallback(() => {
    if (backgroundIntervalRef.current) {
      clearInterval(backgroundIntervalRef.current);
      backgroundIntervalRef.current = null;
      console.log("[Background] Stopped background audio monitoring interval");
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.hidden;
      pageHiddenRef.current = isHidden;

      if (!isRecordingRef.current) return;

      if (isHidden) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
        startBackgroundInterval();
        console.log("[Background] Tab hidden - switched to background interval for audio monitoring");
      } else {
        stopBackgroundInterval();
        if (audioContextRef.current?.state === "suspended") {
          audioContextRef.current.resume().then(() => {
            console.log("[Background] AudioContext resumed after tab visible");
          }).catch(() => {});
        }
        animationRef.current = requestAnimationFrame(() => {
          updateAudioLevelRef.current?.();
        });
        console.log("[Background] Tab visible - switched back to requestAnimationFrame");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopBackgroundInterval();
    };
  }, [startBackgroundInterval, stopBackgroundInterval]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        setCurrentSpeaker(prev => prev === "clinician" ? "patient" : "clinician");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const startRecording = async () => {
    try {
      suppressRecoveryPersistenceRef.current = false;
      // Use selected microphone if available
      const audioConstraints = selectedMicrophoneId 
        ? { deviceId: { exact: selectedMicrophoneId } } 
        : {};
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      pendingChunksRef.current = [];
      nextChunkIdRef.current = 1;
      processedChunkIdsRef.current.clear();
      isTranscribingRef.current = false;
      transcribeLockSessionRef.current = null;
      recordingSessionIdRef.current = crypto.randomUUID();
      orderedChunksRef.current.clear();
      nextExpectedChunkIdRef.current = 1;
      droppedChunksRef.current.clear();
      segmentRmsMaxRef.current.clear();
      segmentSpeechFramesRef.current.clear();
      structuredSegmentsRef.current = [];
      setVadStats({ uploaded: 0, dropped: 0, lastRms: 0 });
      
      // Preserve transcript when resuming an existing note or when the clinician explicitly
      // deferred SOAP generation to continue the same visit after testing.
      const shouldPreserveTranscript =
        (isResumeModeRef.current && !!resumeNoteDataRef.current?.transcript) ||
        isSoapDeferredRef.current;
      if (!shouldPreserveTranscript) {
        committedTextRef.current = "";
      }
      // Always reset these - they're for new recording session
      partialTextRef.current = "";
      recentLinesRef.current = [];
      lastCumulativeTranscriptRef.current = "";
      segmentPeakLevelsRef.current.clear();
      segmentTimestampRef.current.clear();
      segmentControlRef.current = null;
      segmentStartMsRef.current = 0;
      lastSilenceNoticeMsRef.current = 0;
      lastBufferNoticeMsRef.current = 0;

      recordingElapsedMsRef.current = 0;
      recordingStartMsRef.current = Date.now();
      lastVoiceMsRef.current = recordingStartMsRef.current;
      
      // SEGMENTED RECORDING APPROACH:
      // Instead of relying on timeslice mode (which has browser quirks),
      // we use a segmented approach where we create independent recorder sessions
      // with smart chunking and silence-based flushing.

      let currentRecorder: MediaRecorder | null = null;

      const createSegmentRecorder = (segmentId: number, segmentStartMs: number) => {
        const segmentChunks: Blob[] = [];
        const recorder = new MediaRecorder(stream);

        recorder.ondataavailable = (e) => {
          console.log(`[Segment] ondataavailable, size: ${e.data.size}`);
          if (e.data.size > 0) {
            segmentChunks.push(e.data);
          }
        };

        recorder.onstop = () => {
          console.log(`[Segment] Recorder stopped, chunks collected: ${segmentChunks.length}`);

          if (segmentChunks.length > 0) {
            const segmentBlob = new Blob(segmentChunks, { type: recorder.mimeType || "audio/webm" });
            chunksRef.current.push(segmentBlob);
            queueChunkForTranscription(segmentBlob, segmentId, segmentStartMs);
          } else {
            segmentPeakLevelsRef.current.delete(segmentId);
            segmentTimestampRef.current.delete(segmentId);
          }
        };

        recorder.onerror = (event) => {
          console.error("[Segment] Recorder error:", event);
        };

        return recorder;
      };

      const startNewSegment = (reason: "max" | "silence" | "manual" = "manual") => {
        if (!isRecordingRef.current) {
          return;
        }

        const segmentId = nextChunkIdRef.current++;
        const segmentStartMs = Date.now();
        segmentStartMsRef.current = segmentStartMs;
        currentSegmentIdRef.current = segmentId;
        segmentPeakLevelsRef.current.set(segmentId, 0);
        segmentRmsMaxRef.current.set(segmentId, 0);
        segmentSpeechFramesRef.current.set(segmentId, 0);
        segmentTimestampRef.current.set(segmentId, getRecordingTimestampSec(segmentStartMs));
        lastVoiceMsRef.current = segmentStartMs;
        silenceFlushPendingRef.current = false;

        if (segmentMaxTimerRef.current) {
          clearTimeout(segmentMaxTimerRef.current);
        }
        segmentMaxTimerRef.current = setTimeout(() => {
          segmentControlRef.current?.flush("max");
        }, maxSegmentMs);

        currentRecorder = createSegmentRecorder(segmentId, segmentStartMs);
        currentRecorder.start();
        mediaRecorderRef.current = currentRecorder;
        console.log(`[Segment ${segmentId}] Started (${reason})`);
      };

      const flushSegment = (reason: "max" | "silence") => {
        if (!isRecordingRef.current || segmentCyclingRef.current) {
          return;
        }
        segmentCyclingRef.current = true;

        if (segmentMaxTimerRef.current) {
          clearTimeout(segmentMaxTimerRef.current);
          segmentMaxTimerRef.current = null;
        }

        if (currentRecorder && currentRecorder.state === "recording") {
          currentRecorder.stop();
        }

        startNewSegment(reason);
        segmentCyclingRef.current = false;
      };

      segmentControlRef.current = { flush: flushSegment };
      isRecordingRef.current = true;
      pageHiddenRef.current = document.hidden;

      // Start first segment
      startNewSegment("manual");
      
      setRecordingState("recording");
      setGlobalRecording(true);
      setDuration(0);
      addTranscriptEntry("Listening... transcript will appear as you speak");

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      if (pageHiddenRef.current) {
        startBackgroundInterval();
      } else {
        animationRef.current = requestAnimationFrame(updateAudioLevel);
      }

    } catch (error) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to record",
        variant: "destructive",
      });
    }
  };
  
  // Assign to ref for use in useEffect (auto-start)
  startRecordingRef.current = startRecording;

  const pauseRecording = () => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      const recorder = mediaRecorderRef.current;
      
      // Stop max segment timer when pausing
      if (segmentMaxTimerRef.current) {
        clearTimeout(segmentMaxTimerRef.current);
        segmentMaxTimerRef.current = null;
      }
      segmentControlRef.current = null;
      segmentCyclingRef.current = false;
      if (recordingStartMsRef.current) {
        recordingElapsedMsRef.current += Date.now() - recordingStartMsRef.current;
        recordingStartMsRef.current = 0;
      }
      
      // Stop current recorder to capture any pending audio
      console.log("[Pause] Stopping current segment before pause...");
      if (recorder.state === "recording") {
        recorder.stop();
      }
      
      isRecordingRef.current = false;
      setRecordingState("paused");
      setGlobalRecording(false);
      addTranscriptEntry("Transcript paused - processing audio...");
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (backgroundIntervalRef.current) {
        clearInterval(backgroundIntervalRef.current);
        backgroundIntervalRef.current = null;
      }
      setAudioLevel([0, 0, 0, 0, 0]);
      setGlobalAudioLevel([0, 0, 0, 0, 0]);
    }
  };

  const resumeRecording = () => {
    if (streamRef.current && recordingState === "paused") {
      const stream = streamRef.current;

      recordingStartMsRef.current = Date.now();
      lastVoiceMsRef.current = recordingStartMsRef.current;
      lastSilenceNoticeMsRef.current = 0;
      lastBufferNoticeMsRef.current = 0;

      let currentRecorder: MediaRecorder | null = null;

      const createSegmentRecorder = (segmentId: number, segmentStartMs: number) => {
        const segmentChunks: Blob[] = [];
        const recorder = new MediaRecorder(stream);

        recorder.ondataavailable = (e) => {
          console.log(`[Segment Resume] ondataavailable, size: ${e.data.size}`);
          if (e.data.size > 0) {
            segmentChunks.push(e.data);
          }
        };

        recorder.onstop = () => {
          console.log(`[Segment Resume] Recorder stopped, chunks: ${segmentChunks.length}`);

          if (segmentChunks.length > 0) {
            const segmentBlob = new Blob(segmentChunks, { type: recorder.mimeType || "audio/webm" });
            chunksRef.current.push(segmentBlob);
            queueChunkForTranscription(segmentBlob, segmentId, segmentStartMs);
          } else {
            segmentPeakLevelsRef.current.delete(segmentId);
            segmentTimestampRef.current.delete(segmentId);
          }
        };

        return recorder;
      };

      const startNewSegment = (reason: "max" | "silence" | "manual" = "manual") => {
        if (!isRecordingRef.current) {
          return;
        }

        const segmentId = nextChunkIdRef.current++;
        const segmentStartMs = Date.now();
        segmentStartMsRef.current = segmentStartMs;
        currentSegmentIdRef.current = segmentId;
        segmentPeakLevelsRef.current.set(segmentId, 0);
        segmentRmsMaxRef.current.set(segmentId, 0);
        segmentSpeechFramesRef.current.set(segmentId, 0);
        segmentTimestampRef.current.set(segmentId, getRecordingTimestampSec(segmentStartMs));
        lastVoiceMsRef.current = segmentStartMs;
        silenceFlushPendingRef.current = false;

        if (segmentMaxTimerRef.current) {
          clearTimeout(segmentMaxTimerRef.current);
        }
        segmentMaxTimerRef.current = setTimeout(() => {
          segmentControlRef.current?.flush("max");
        }, maxSegmentMs);

        currentRecorder = createSegmentRecorder(segmentId, segmentStartMs);
        currentRecorder.start();
        mediaRecorderRef.current = currentRecorder;
        console.log(`[Segment Resume ${segmentId}] Started (${reason})`);
      };

      const flushSegment = (reason: "max" | "silence") => {
        if (!isRecordingRef.current || segmentCyclingRef.current) {
          return;
        }
        segmentCyclingRef.current = true;

        if (segmentMaxTimerRef.current) {
          clearTimeout(segmentMaxTimerRef.current);
          segmentMaxTimerRef.current = null;
        }

        if (currentRecorder && currentRecorder.state === "recording") {
          currentRecorder.stop();
        }

        startNewSegment(reason);
        segmentCyclingRef.current = false;
      };

      segmentControlRef.current = { flush: flushSegment };
      isRecordingRef.current = true;

      startNewSegment("manual");

      setRecordingState("recording");
      setGlobalRecording(true);
      addTranscriptEntry("Transcript resumed");
      
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
      
      pageHiddenRef.current = document.hidden;
      if (pageHiddenRef.current) {
        startBackgroundInterval();
      } else {
        animationRef.current = requestAnimationFrame(updateAudioLevel);
      }
    }
  };

  const stopRecording = () => {
    return new Promise<Blob>((resolve) => {
      // Clean up max segment timer
      if (segmentMaxTimerRef.current) {
        clearTimeout(segmentMaxTimerRef.current);
        segmentMaxTimerRef.current = null;
      }
      segmentControlRef.current = null;
      segmentCyclingRef.current = false;
      if (recordingStartMsRef.current) {
        recordingElapsedMsRef.current += Date.now() - recordingStartMsRef.current;
        recordingStartMsRef.current = 0;
      }
      
      isRecordingRef.current = false;
      setGlobalRecording(false);
      setGlobalAudioLevel([0, 0, 0, 0, 0]);
      
      if (mediaRecorderRef.current) {
        const recorder = mediaRecorderRef.current;
        
        // IMPORTANT: Don't overwrite onstop - the original handler processes the final segment
        // Instead, wrap it to also resolve our promise after the original handler runs
        const originalOnStop = recorder.onstop;
        recorder.onstop = (event) => {
          // Let original handler process the segment first
          if (originalOnStop) {
            originalOnStop.call(recorder, event);
          }
          
          // Give time for final segment processing to complete
          setTimeout(() => {
            const blob = new Blob(chunksRef.current, { type: "audio/webm" });
            console.log(`[Stop] Recording stopped. Total chunks: ${chunksRef.current.length}, Blob size: ${blob.size}`);
            
            // Clean up stream AFTER processing is done
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((track) => track.stop());
              streamRef.current = null;
            }
            
            resolve(blob);
          }, 300);
        };
        
        // If recording, stop the current segment recorder
        if (recorder.state === "recording") {
          console.log("[Stop] Stopping final segment...");
          recorder.stop();
        } else if (recorder.state === "paused") {
          console.log("[Stop] Stopping from paused state...");
          recorder.stop();
        } else {
          // Already inactive - clean up and resolve
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
          }
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          resolve(blob);
        }
      } else {
        resolve(new Blob([], { type: "audio/webm" }));
      }

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (backgroundIntervalRef.current) {
        clearInterval(backgroundIntervalRef.current);
        backgroundIntervalRef.current = null;
      }

      setAudioLevel([0, 0, 0, 0, 0]);
      addTranscriptEntry("Transcript stopped");
    });
  };

  const resolveChiefComplaintTitle = useCallback(
    async (transcript: string, patientNameValue?: string) => {
      const fallbackTitle = getFallbackTitle(patientNameValue);
      if (!transcript.trim()) return fallbackTitle;

      const preview = getChiefComplaintPreview(transcript);
      try {
        const titleResponse = await apiRequest("POST", "/api/generate-title", { transcript });
        const titleData = await titleResponse.json();
        const generatedTitle = typeof titleData?.title === "string" ? titleData.title.trim() : "";
        if (generatedTitle) return generatedTitle;
      } catch {
        // Fall back to local title if title generation API fails.
      }

      if (preview && preview !== "Chief complaint") {
        return preview;
      }

      return fallbackTitle;
    },
    []
  );

  const resetSessionForNextRecording = useCallback(() => {
    suppressRecoveryPersistenceRef.current = true;
    setRecordingState("idle");
    setDuration(0);
    setTranscriptEntries([]);
    setSoapNote(null);
    setSoapDebugInfo(null);
    setIsSoapDeferred(false);
    isSoapDeferredRef.current = false;
    setPatientName("");
    setContextText("");
    setActiveTab("transcript");

    // Exit resume mode so next recording starts a fresh note.
    setIsResumeMode(false);
    isResumeModeRef.current = false;
    setResumeNoteData(null);
    resumeNoteDataRef.current = null;

    // Clear transcript aggregation buffers.
    committedTextRef.current = "";
    partialTextRef.current = "";
    recentLinesRef.current = [];
    lastCumulativeTranscriptRef.current = "";
    structuredSegmentsRef.current = [];

    // Keep queue refs clean for next recording cycle.
    pendingChunksRef.current = [];
    orderedChunksRef.current.clear();
    droppedChunksRef.current.clear();
    processedChunkIdsRef.current.clear();
    isTranscribingRef.current = false;
    transcribeLockSessionRef.current = null;
    recordingSessionIdRef.current = "";
    activeDraftIdRef.current = crypto.randomUUID();
    nextChunkIdRef.current = 0;
    nextExpectedChunkIdRef.current = 1;

    clearBackup();
  }, [clearBackup]);

  const queueSessionDraftForLater = useCallback(async () => {
    const transcript = (
      committedTextRef.current.trim() ||
      transcriptEntries
        .filter((entry) => entry.type === "content")
        .map((entry) => entry.text)
        .join("\n")
        .trim()
    ).trim();

    if (!transcript) {
      resetSessionForNextRecording();
      return;
    }

    const patientNameSnapshot = patientName.trim();
    const contextTextSnapshot = contextText;
    const resumeNote = resumeNoteDataRef.current;
    const draftRecoveryIdSnapshot = activeDraftIdRef.current;
    const noteData = soapNote ? buildNoteSectionsFromSoap(soapNote) : null;
    const title = getChiefComplaintPreview(transcript) || getFallbackTitle(patientNameSnapshot);

    saveBackup(transcript, patientNameSnapshot, "general", {
      contextText: contextTextSnapshot,
      source: "manual_defer",
      noteId: resumeNote?.id ?? null,
      noteTitle: resumeNote?.title ?? title,
      draftId: draftRecoveryIdSnapshot,
    });
    saveInflightScribeRecovery({
      id: draftRecoveryIdSnapshot,
      transcript,
      patientName: patientNameSnapshot,
      contextText: contextTextSnapshot,
      savedAt: new Date().toISOString(),
      reason: "manual-next-patient",
      noteId: resumeNote?.id ?? null,
      noteTitle: resumeNote?.title ?? title,
    });

    resetSessionForNextRecording();

    void (async () => {
      try {
        let savedNote: SessionSavedNote;
        if (resumeNote) {
          const response = await apiRequest("PATCH", `/api/notes/${resumeNote.id}`, {
            title: resumeNote.title || title,
            patientName: patientNameSnapshot || null,
            transcript,
            patientContext: contextTextSnapshot || null,
            ...(noteData || {}),
          });
          savedNote = await response.json();
        } else {
          const response = await apiRequest("POST", "/api/notes", {
            title,
            patientName: patientNameSnapshot || null,
            specialty: "general",
            transcript,
            patientContext: contextTextSnapshot || null,
            ...(noteData || {}),
          });
          savedNote = await response.json();
        }

        upsertSavedNoteInCache(savedNote);
        queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
        if (savedNote.id) {
          queryClient.invalidateQueries({ queryKey: ["/api/notes", savedNote.id.toString()] });
        }
        clearDraftRecoveryAfterSuccessfulSave({
          draftId: draftRecoveryIdSnapshot,
          noteId: savedNote.id,
          transcript,
        });
        toast({
          title: "Ready for the next patient",
          description: "The current session was saved to Scribe in the background.",
        });
      } catch (error) {
        console.error("Failed to queue session draft:", error);
        toast({
          title: "Next patient started",
          description: "The current work was preserved for recovery, but the background draft save failed.",
        });
      }
    })();
  }, [
    buildNoteSectionsFromSoap,
    clearDraftRecoveryAfterSuccessfulSave,
    contextText,
    getFallbackTitle,
    patientName,
    queryClient,
    resetSessionForNextRecording,
    saveBackup,
    saveInflightScribeRecovery,
    soapNote,
    toast,
    transcriptEntries,
    upsertSavedNoteInCache,
  ]);

  const finalizeSnapshot = async (
    snapshot: FinalizeSnapshot,
    options?: {
      background?: boolean;
      forceSoapGeneration?: boolean;
    },
  ) => {
    try {
      let transcript = snapshot.transcript.trim();
      const ordered = new Map<number, OrderedChunkEntry>(snapshot.orderedChunks);
      const dropped = new Set<number>(snapshot.droppedChunks);
      let nextExpected = snapshot.nextExpectedChunkId;
      const structuredSegments = [...snapshot.structuredSegments];

      const flushOrdered = () => {
        while (ordered.has(nextExpected) || dropped.has(nextExpected)) {
          if (dropped.has(nextExpected)) {
            dropped.delete(nextExpected);
            nextExpected++;
            continue;
          }

          const entry = ordered.get(nextExpected);
          ordered.delete(nextExpected);
          if (!entry) {
            nextExpected++;
            continue;
          }

          const text = entry.text.trim();
          if (text) {
            transcript = transcript ? `${transcript} ${text}` : text;
            if (!structuredSegments.some((segment) => segment.chunk_id === nextExpected)) {
              structuredSegments.push({
                speaker: entry.speaker,
                text,
                chunk_id: nextExpected,
                timestamp: entry.timestampSec,
              });
            }
          }

          nextExpected++;
        }
      };

      flushOrdered();

      const pendingChunks = snapshot.pendingChunks
        .filter((chunk) => !chunk.processed && chunk.id >= nextExpected)
        .sort((a, b) => a.id - b.id);

      for (const chunk of pendingChunks) {
        if (ordered.has(chunk.id) || dropped.has(chunk.id)) {
          flushOrdered();
          continue;
        }

        if (chunk.peakLevel < noiseThreshold) {
          ordered.set(chunk.id, { text: "", timestampSec: chunk.timestampSec, speaker: chunk.speaker });
          flushOrdered();
          continue;
        }

        const result = await transcribeChunk(chunk.blob, chunk.id, {
          sessionId: snapshot.sessionId,
          language: snapshot.transcriptionLanguage,
        });

        if (result.ok) {
          ordered.set(result.chunk_id, {
            text: result.transcript.trim(),
            timestampSec: chunk.timestampSec,
            speaker: chunk.speaker,
          });
        } else {
          dropped.add(chunk.id);
        }

        flushOrdered();
      }

      if (!transcript.trim()) {
        toast({
          title: "No speech detected",
          description: "The recording didn't capture any speech. Please try again.",
          variant: "destructive",
        });
        return;
      }

      await autoGenerateAndSave(transcript, {
        background: options?.background === true,
        forceSoapGeneration: options?.forceSoapGeneration,
        patientName: snapshot.patientName,
        contextText: snapshot.contextText,
        selectedTemplateId: snapshot.selectedTemplateId,
        transcriptionLanguage: snapshot.transcriptionLanguage,
        speakerSegments: structuredSegments,
        resumeMode: snapshot.resumeMode,
        resumeNoteData: snapshot.resumeNoteData,
        sessionDurationSeconds: snapshot.sessionDurationSeconds,
      });
    } catch (error) {
      console.error("Finalization failed:", error);
      toast({
        title: "Processing failed",
        description:
          options?.background === true
            ? "There was an issue processing the recording in background."
            : "There was an issue finishing the recording.",
        variant: "destructive",
      });
      if (options?.background !== true) {
        setRecordingState("idle");
      }
    }
  };

  const waitForPendingChunksToFinish = async (sessionId: string, timeoutMs: number = 90_000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const remainingChunks = pendingChunksRef.current.filter((chunk) => !chunk.processed).length;
      const sameSession = recordingSessionIdRef.current === sessionId;

      if ((!sameSession || remainingChunks === 0) && !isTranscribingRef.current) {
        pendingChunksRef.current = pendingChunksRef.current.filter((chunk) => !chunk.processed);
        flushOrderedChunks();
        finalizePartial();
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    throw new Error("Timed out waiting for pending transcription to finish");
  };

  const transcribeShortRecordingOnly = useCallback(async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("language", transcriptionLanguage);

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Transcription failed");
    }

    return response.json();
  }, [transcriptionLanguage]);

  const queueBackgroundFinalization = useCallback(
    (snapshot: FinalizeSnapshot) => {
      const generationId = startScribeGeneration(
        user?.id,
        getChiefComplaintPreview(snapshot.transcript),
        snapshot.resumeNoteData?.id,
      );

      saveInflightScribeRecovery({
        id: snapshot.draftRecoveryId,
        transcript: snapshot.transcript,
        patientName: snapshot.patientName,
        contextText: snapshot.contextText,
        savedAt: new Date().toISOString(),
        reason: snapshot.resumeMode ? "background-resume-finalization" : "background-finalization",
        noteId: snapshot.resumeNoteData?.id ?? null,
        noteTitle: snapshot.resumeNoteData?.title ?? null,
      });

      void finalizeSnapshot(snapshot, {
        background: true,
        forceSoapGeneration: true,
      }).finally(() => {
        finishScribeGeneration(user?.id, generationId);
      });

      toast({
        title: "Processing in background",
        description: snapshot.resumeMode
          ? "You can start the next patient now. The resumed note will finish updating in the background."
          : "You can start the next patient now. This note will finish saving in the background.",
      });

      resetSessionForNextRecording();
    },
    [finalizeSnapshot, resetSessionForNextRecording, saveInflightScribeRecovery, toast, user?.id],
  );

  const finalizeRecording = async () => {
    setRecordingState("processing");
    addTranscriptEntry("Finalizing note...");

    try {
      finalizePartial();

      const snapshot: FinalizeSnapshot = {
        transcript: committedTextRef.current.trim(),
        pendingChunks: pendingChunksRef.current.map((chunk) => ({ ...chunk })),
        orderedChunks: new Map(orderedChunksRef.current),
        droppedChunks: new Set(droppedChunksRef.current),
        nextExpectedChunkId: nextExpectedChunkIdRef.current,
        structuredSegments: [...structuredSegmentsRef.current],
        patientName,
        contextText,
        selectedTemplateId,
        transcriptionLanguage,
        resumeMode: isResumeModeRef.current,
        resumeNoteData: resumeNoteDataRef.current,
        sessionId: recordingSessionIdRef.current,
        sessionDurationSeconds: duration,
        draftRecoveryId: activeDraftIdRef.current,
      };

      const hasPendingChunks = snapshot.pendingChunks.some((chunk) => !chunk.processed);
      const hasTranscriptWork =
        snapshot.transcript.length > 0 || snapshot.orderedChunks.size > 0 || hasPendingChunks;

      if (!hasTranscriptWork) {
        toast({
          title: "No speech detected",
          description: "The recording didn't capture any speech. Please try again.",
          variant: "destructive",
        });
        setRecordingState("idle");
        return;
      }

      queueBackgroundFinalization(snapshot);
    } catch (error) {
      console.error("Finalization failed:", error);
      toast({
        title: "Processing failed",
        description: "There was an issue processing the recording.",
        variant: "destructive",
      });
      setRecordingState("idle");
    }
  };

  // Automatic SOAP generation and save after transcription
  const autoGenerateAndSave = async (transcript: string, options?: AutoGenerateAndSaveOptions) => {
    const background = options?.background === true;
    const patientNameSnapshot = options?.patientName ?? patientName;
    const contextTextSnapshot = options?.contextText ?? contextText;
    const selectedTemplateIdSnapshot = options?.selectedTemplateId ?? selectedTemplateId;
    const transcriptionLanguageSnapshot = options?.transcriptionLanguage ?? transcriptionLanguage;
    const sessionDurationSecondsSnapshot = options?.sessionDurationSeconds ?? duration;
    const currentIsResumeMode = options?.resumeMode ?? isResumeModeRef.current;
    const currentResumeNoteData = options?.resumeNoteData ?? resumeNoteDataRef.current;
    const draftRecoveryIdSnapshot = options?.draftRecoveryId ?? activeDraftIdRef.current;
    const shouldRegenerateResumeNote = Boolean(currentIsResumeMode && currentResumeNoteData);

    try {
      const segments =
        options?.speakerSegments && options.speakerSegments.length > 0
          ? options.speakerSegments
          : structuredSegmentsRef.current.length > 0
            ? structuredSegmentsRef.current
            : undefined;
      const usableSpeakerSegments = getUsableSpeakerSegments(transcript, segments);
      const priorVisitMinutes = extractVisitTimeMinutesFromPayload(currentResumeNoteData?.icdCodes);
      const visitTimePayload = buildIcdCodesWithVisitTime(
        null,
        sessionDurationSecondsSnapshot,
        currentIsResumeMode ? priorVisitMinutes : undefined,
      );

      if (shouldRegenerateResumeNote && currentResumeNoteData) {
        const regenerateResponse = await apiRequest(
          "POST",
          `/api/notes/${currentResumeNoteData.id}/regenerate-from-transcript`,
          {
            transcript,
            patientName: patientNameSnapshot || null,
            specialty: "general",
            templateId: resolveRequestedTemplateId(selectedTemplateIdSnapshot),
            outputLanguage: transcriptionLanguageSnapshot,
            context: contextTextSnapshot || null,
            speakerSegments: usableSpeakerSegments,
            icdCodes: visitTimePayload ? JSON.stringify(visitTimePayload) : null,
            consumeNoteCredit: true,
          },
        );
        const generatedSoapDebugInfo = canViewSoapDebug
          ? readSoapDebugInfoFromResponse(regenerateResponse)
          : null;
        const updatedNote = (await regenerateResponse.json()) as SessionSavedNote;

        upsertSavedNoteInCache(updatedNote);
        queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/notes", currentResumeNoteData.id.toString()] });
        queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
        clearDraftRecoveryAfterSuccessfulSave({
          draftId: draftRecoveryIdSnapshot,
          noteId: currentResumeNoteData.id,
          transcript,
        });

        // Reflect the regenerated note in the active session view so the user
        // doesn't have to hit "Regenerate" manually. Guard against the user
        // having moved to a different note since the regeneration started.
        if (resumeNoteDataRef.current?.id === currentResumeNoteData.id) {
          setSoapNote(updatedNote as any);
          setSoapDebugInfo(generatedSoapDebugInfo);
          setIsSoapDeferred(false);
          isSoapDeferredRef.current = false;
        }

        if (generatedSoapDebugInfo) {
          saveSoapDebugInfo(currentResumeNoteData.id, generatedSoapDebugInfo);
        }

        if (background) {
          toast({
            title: "Resumed note updated",
            description: "The SOAP note now reflects the full transcript from both visits.",
          });
        } else {
          toast({
            title: "Session updated",
            description: "The note was recreated from the updated transcript.",
          });
          navigate(`/notes/${currentResumeNoteData.id}`);
        }

        return;
      }

      // Step 1: Generate SOAP note
      const soapResponse = await apiRequest("POST", "/api/generate-soap", {
        transcript,
        patientName: patientNameSnapshot,
        specialty: "general",
        templateId: resolveRequestedTemplateId(selectedTemplateIdSnapshot),
        outputLanguage: transcriptionLanguageSnapshot,
        context: contextTextSnapshot || undefined,
        speakerSegments: usableSpeakerSegments,
        noteId: currentResumeNoteData?.id,
        enforceNoteCredit: true,
      });
      const generatedSoapDebugInfo = canViewSoapDebug
        ? readSoapDebugInfoFromResponse(soapResponse)
        : null;
      const soapData = await soapResponse.json();

      setIsSoapDeferred(false);
      isSoapDeferredRef.current = false;
      
      if (!background) {
        setSoapNote({
          ...soapData,
          icdCodes: undefined,
        });
        setSoapDebugInfo(generatedSoapDebugInfo);
        addTranscriptEntry("Saving note...");
      }

      let savedNoteId: number;

      console.log("[Save] isResumeMode (ref):", currentIsResumeMode, "resumeNoteData (ref):", currentResumeNoteData);
      
      if (currentIsResumeMode && currentResumeNoteData) {
        // Update existing note (resume mode)
        const noteData = buildNoteSectionsFromSoap(soapData);
        console.log("[Save] HPI format detected:", !!soapData.hpi, "Saving noteData:", noteData);
        
        const updateResponse = await apiRequest("PATCH", `/api/notes/${currentResumeNoteData.id}`, {
          patientName: patientNameSnapshot || null,
          ...noteData,
          transcript,
          patientContext: contextTextSnapshot || null,
          icdCodes: visitTimePayload ? JSON.stringify(visitTimePayload) : null,
          consumeNoteCredit: true,
        });
        const updatedNote = (await updateResponse.json()) as SessionSavedNote;
        upsertSavedNoteInCache(updatedNote);
        savedNoteId = typeof updatedNote?.id === "number" ? updatedNote.id : currentResumeNoteData.id;
        if (generatedSoapDebugInfo) {
          saveSoapDebugInfo(savedNoteId, generatedSoapDebugInfo);
        }
        
        if (!background) {
          toast({
            title: "Session updated",
            description: "Your additional recording has been added. Generate billing codes later from the note page if needed.",
          });
        }
      } else {
        // Create new note
        const title = await resolveChiefComplaintTitle(transcript, patientNameSnapshot || undefined);

        const noteData = buildNoteSectionsFromSoap(soapData);
        console.log("[Save New] HPI format detected:", !!soapData.hpi, "Saving noteData:", noteData);

        const saveResponse = await apiRequest("POST", "/api/notes", {
          title,
          patientName: patientNameSnapshot,
          specialty: "general",
          ...noteData,
          transcript,
          patientContext: contextTextSnapshot || null,
          icdCodes: visitTimePayload ? JSON.stringify(visitTimePayload) : null,
          consumeNoteCredit: true,
        });
        const savedNote = (await saveResponse.json()) as SessionSavedNote;
        upsertSavedNoteInCache(savedNote);
        savedNoteId = savedNote.id;
        if (generatedSoapDebugInfo) {
          saveSoapDebugInfo(savedNoteId, generatedSoapDebugInfo);
        }
        
        if (!background) {
          toast({
            title: "Session complete",
            description: "Your note has been saved. Generate billing codes later from the note page if needed.",
          });
        }
      }

      // Clear backup and refresh notes list.
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", savedNoteId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      clearDraftRecoveryAfterSuccessfulSave({
        draftId: draftRecoveryIdSnapshot,
        noteId: savedNoteId,
        transcript,
      });

      if (background) {
        toast({
          title: "Background processing complete",
          description: "Your session note is ready in Scribe.",
        });
      } else {
        navigate(`/notes/${savedNoteId}`);
      }

    } catch (error) {
      console.error("Auto-save failed:", error);
      let fallbackDraftId: number | null = null;
      if (!currentResumeNoteData) {
        try {
          const fallbackDraft = await saveTranscriptOnlyDraftNote({
            transcript,
            patientName: patientNameSnapshot,
            contextText: contextTextSnapshot,
          });
          fallbackDraftId = typeof fallbackDraft?.id === "number" ? fallbackDraft.id : null;
          queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
          if (fallbackDraftId !== null) {
            queryClient.invalidateQueries({ queryKey: ["/api/notes", fallbackDraftId.toString()] });
          }
        } catch (fallbackError) {
          console.error("Fallback draft save failed:", fallbackError);
        }
      }
      saveBackup(transcript, patientNameSnapshot, "general", {
        contextText: contextTextSnapshot,
        source: "soap_error",
        noteId: currentResumeNoteData?.id ?? null,
        noteTitle: currentResumeNoteData?.title ?? null,
        draftId: draftRecoveryIdSnapshot,
      });
      saveInflightScribeRecovery({
        id: draftRecoveryIdSnapshot,
        transcript,
        patientName: patientNameSnapshot,
        contextText: contextTextSnapshot,
        savedAt: new Date().toISOString(),
        reason: "soap-generation-failed",
        noteId: currentResumeNoteData?.id ?? null,
        noteTitle: currentResumeNoteData?.title ?? null,
      });
      toast({
        title: fallbackDraftId !== null ? "SOAP generation failed" : "Auto-save failed",
        description:
          (() => {
            const creditError = getNoteCreditError(error);
            if (creditError) {
              return `${creditError.message}${fallbackDraftId !== null ? " Your transcript was still saved as a draft in Scribe." : ""}`;
            }
            const debugFailure = canViewSoapDebug ? readSoapDebugFailureFromError(error) : null;
            if (debugFailure) {
              return `${debugFailure.reason}${debugFailure.trace ? ` Trace: ${debugFailure.trace}` : ""}`;
            }
            return fallbackDraftId !== null
              ? "Your transcript was saved as a draft note in Scribe. Open it later to regenerate SOAP."
              : "Your transcript draft was preserved for recovery.";
          })(),
        variant: "destructive",
      });
      if (!background) {
        setRecordingState("idle");
      }
    }
  };

  const mergeResumeTranscript = useCallback((existingTranscript?: string | null, nextTranscript?: string | null) => {
    const previous = typeof existingTranscript === "string" ? existingTranscript.trim() : "";
    const incoming = typeof nextTranscript === "string" ? nextTranscript.trim() : "";

    if (!previous) return incoming;
    if (!incoming) return previous;
    return `${previous}\n\n${incoming}`;
  }, []);

  const queueBackgroundShortRecordingFinalization = useCallback(
    (params: {
      audioBlob: Blob;
      patientName: string;
      contextText: string;
      selectedTemplateId: string;
      resumeMode: boolean;
      resumeNoteData: ResumeNoteData | null;
      sessionDurationSeconds: number;
      draftRecoveryId: string;
      speakerSegments?: StructuredSegment[];
    }) => {
      const generationId = startScribeGeneration(
        user?.id,
        getFallbackTitle(params.patientName),
        params.resumeNoteData?.id,
      );

      toast({
        title: "Processing in background",
        description: params.resumeMode
          ? "You can start the next patient now. The resumed note will finish updating in the background."
          : "You can start the next patient now. This note will finish saving in the background.",
      });

      resetSessionForNextRecording();

      void (async () => {
        try {
          const data = await transcribeShortRecordingOnly(params.audioBlob);
          const transcriptText = (data.text || data.transcript || "").trim();
          const combinedTranscript =
            params.resumeMode && params.resumeNoteData
              ? mergeResumeTranscript(params.resumeNoteData.transcript, transcriptText)
              : transcriptText;

          if (!combinedTranscript) {
            toast({
              title: "No speech detected",
              description: "The recording didn't capture any speech. Please try again.",
              variant: "destructive",
            });
            return;
          }

          saveInflightScribeRecovery({
            id: params.draftRecoveryId,
            transcript: combinedTranscript,
            patientName: params.patientName,
            contextText: params.contextText,
            savedAt: new Date().toISOString(),
            reason: params.resumeMode ? "background-resume-finalization" : "background-finalization",
            noteId: params.resumeNoteData?.id ?? null,
            noteTitle: params.resumeNoteData?.title ?? null,
          });

          await autoGenerateAndSave(combinedTranscript, {
            background: true,
            forceSoapGeneration: true,
            patientName: params.patientName,
            contextText: params.contextText,
            selectedTemplateId: params.selectedTemplateId,
            transcriptionLanguage,
            speakerSegments: params.speakerSegments,
            resumeMode: params.resumeMode,
            resumeNoteData: params.resumeNoteData,
            sessionDurationSeconds: params.sessionDurationSeconds,
            draftRecoveryId: params.draftRecoveryId,
          });
        } catch (error) {
          console.error("Short recording finalization failed:", error);
          toast({
            title: "Processing failed",
            description: error instanceof Error ? error.message : "There was an issue finishing the recording.",
            variant: "destructive",
          });
        } finally {
          finishScribeGeneration(user?.id, generationId);
        }
      })();
    },
    [
      autoGenerateAndSave,
      getFallbackTitle,
      resetSessionForNextRecording,
      saveInflightScribeRecovery,
      toast,
      transcribeShortRecordingOnly,
      transcriptionLanguage,
      user?.id,
      mergeResumeTranscript,
    ],
  );

  const transcribeMutation = useMutation({
    mutationFn: async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("language", transcriptionLanguage);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Transcription failed");
      }

      return response.json();
    },
    onSuccess: async (data) => {
      if (data.transcript) {
        // Add transcript content
        addTranscriptEntry(data.transcript, "content");
        committedTextRef.current = (committedTextRef.current + " " + data.transcript).trim();

        // Snapshot state now because we reset session immediately after kicking off background save.
        // Without this, resume sessions can be treated as new notes due to async timing.
        const transcriptSnapshot = committedTextRef.current;
        const patientNameSnapshot = patientName;
        const contextTextSnapshot = contextText;
        const selectedTemplateIdSnapshot = selectedTemplateId;
        const resumeModeSnapshot = isResumeModeRef.current;
        const resumeNoteDataSnapshot = resumeNoteDataRef.current;
        const draftRecoveryIdSnapshot = activeDraftIdRef.current;
        const speakerSegmentsSnapshot =
          structuredSegmentsRef.current.length > 0 ? [...structuredSegmentsRef.current] : undefined;
        const sessionDurationSecondsSnapshot = duration;
        
        // New notes and resumed notes both finish in the background so the user can
        // move to the next patient immediately.
        addTranscriptEntry(
          resumeModeSnapshot
            ? "Updating resumed note in background..."
            : "Generating SOAP note in background...",
        );
        const generationId = startScribeGeneration(
          user?.id,
          getChiefComplaintPreview(transcriptSnapshot),
          resumeNoteDataSnapshot?.id,
        );
        saveInflightScribeRecovery({
          id: draftRecoveryIdSnapshot,
          transcript: transcriptSnapshot,
          patientName: patientNameSnapshot,
          contextText: contextTextSnapshot,
          savedAt: new Date().toISOString(),
          reason: "background-auto-save",
          noteId: resumeNoteDataSnapshot?.id ?? null,
          noteTitle: resumeNoteDataSnapshot?.title ?? null,
        });
        void autoGenerateAndSave(transcriptSnapshot, {
          background: true,
          forceSoapGeneration: resumeModeSnapshot,
          patientName: patientNameSnapshot,
          contextText: contextTextSnapshot,
          selectedTemplateId: selectedTemplateIdSnapshot,
          transcriptionLanguage,
          speakerSegments: speakerSegmentsSnapshot,
          resumeMode: resumeModeSnapshot,
          resumeNoteData: resumeNoteDataSnapshot,
          sessionDurationSeconds: sessionDurationSecondsSnapshot,
          draftRecoveryId: draftRecoveryIdSnapshot,
        }).finally(() => {
          finishScribeGeneration(user?.id, generationId);
        });
        toast({
          title: "Processing in background",
          description: resumeModeSnapshot
            ? "You can start a new session now. The resumed note will finish updating in the background."
            : "You can start a new session now. This note will save when processing finishes.",
        });
        resetSessionForNextRecording();
      } else {
        toast({
          title: "No speech detected",
          description: "The recording didn't capture any speech. Please try again.",
          variant: "destructive",
        });
        setRecordingState("idle");
      }
    },
    onError: (error: Error) => {
      setRecordingState("idle");
      toast({
        title: "Transcription failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const generateSoapMutation = useMutation({
    mutationFn: async () => {
      const transcript = transcriptEntries
        .filter((e) => e.type === "content")
        .map((e) => e.text)
        .join("\n");

      console.log("[Regenerate] Sending request with templateId:", selectedTemplateId);
      const segments = structuredSegmentsRef.current.length > 0 ? structuredSegmentsRef.current : undefined;
      const usableSpeakerSegments = getUsableSpeakerSegments(transcript, segments);
      const response = await apiRequest("POST", "/api/generate-soap", {
        transcript,
        patientName,
        specialty: "general",
        templateId: resolveRequestedTemplateId(selectedTemplateId),
        outputLanguage: transcriptionLanguage,
        context: contextText || undefined,
        speakerSegments: usableSpeakerSegments,
        noteId: resumeNoteDataRef.current?.id,
        enforceNoteCredit: true,
      });
      const debugInfo = canViewSoapDebug ? readSoapDebugInfoFromResponse(response) : null;
      const data = await response.json();
      console.log("[Regenerate] Received response:", data);
      console.log("[Regenerate] Response keys:", Object.keys(data));
      
      return { data, debugInfo };
    },
    onSuccess: ({ data, debugInfo }) => {
      console.log("[Regenerate] Setting soapNote state:", data);
      setSoapNote({
        ...data,
        icdCodes: undefined,
      });
      setSoapDebugInfo(debugInfo);
      setIsSoapDeferred(false);
      isSoapDeferredRef.current = false;
      setActiveTab("soap");
      setTranscriptPanelOpen(false); // Collapse transcript panel when SOAP is generated
      toast({
        title: "SOAP regenerated",
        description: "Billing codes are no longer generated automatically. Use the note page if you want code suggestions.",
      });
    },
    onError: (error) => {
      const debugFailure = canViewSoapDebug ? readSoapDebugFailureFromError(error) : null;
      const transcript = transcriptEntries
        .filter((entry) => entry.type === "content")
        .map((entry) => entry.text)
        .join("\n")
        .trim();
      if (transcript) {
        saveBackup(transcript, patientName, "general", {
          contextText,
          source: "soap_error",
          noteId: resumeNoteDataRef.current?.id ?? null,
          noteTitle: resumeNoteDataRef.current?.title ?? null,
        });
      }
      toast({
        title: "SOAP generation failed",
        description:
          getNoteCreditError(error)?.message ||
          (debugFailure
            ? `${debugFailure.reason}${debugFailure.trace ? ` Trace: ${debugFailure.trace}` : ""}`
            : "The transcript draft was preserved for recovery."),
        variant: "destructive",
      });
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async () => {
      const transcript = transcriptEntries
        .filter((e) => e.type === "content")
        .map((e) => e.text)
        .join("\n");

      // Prefer chief-complaint titles for consistency with background flow.
      const title = await resolveChiefComplaintTitle(transcript, patientName || undefined);

      const noteData = buildNoteSectionsFromSoap(soapNote || {});
      const icdCodesPayload = buildIcdCodesWithVisitTime(soapNote?.icdCodes || null, duration) || null;

      const requestMethod =
        isResumeModeRef.current && resumeNoteDataRef.current ? "PATCH" : "POST";
      const requestPath =
        isResumeModeRef.current && resumeNoteDataRef.current
          ? `/api/notes/${resumeNoteDataRef.current.id}`
          : "/api/notes";

      const response = await apiRequest(requestMethod, requestPath, {
        title,
        patientName,
        specialty: "general",
        ...noteData,
        transcript,
        patientContext: contextText || null,
        icdCodes: icdCodesPayload ? JSON.stringify(icdCodesPayload) : null,
        consumeNoteCredit: true,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", data.id.toString()] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      clearDraftRecoveryAfterSuccessfulSave({
        draftId: activeDraftIdRef.current,
        noteId: typeof data.id === "number" ? data.id : null,
        transcript:
          typeof data?.transcript === "string"
            ? data.transcript
            : transcriptEntries
                .filter((entry) => entry.type === "content")
                .map((entry) => entry.text)
                .join("\n"),
      });
      toast({
        title: "Session saved",
        description: "Your session has been saved successfully",
      });
      navigate(`/notes/${data.id}`);
    },
    onError: (error) => {
      const creditError = getNoteCreditError(error);
      toast({
        title: "Failed to save",
        description: creditError?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Search differentials and labs for difficult cases
  const searchDifferentials = async () => {
    if (!soapNote) return;
    
    setIsDifferentialSearching(true);
    setDifferentialResults(null);
    
    try {
      // Build case details from available information
      const caseDetails = [
        soapNote.subjective && `Subjective: ${soapNote.subjective}`,
        soapNote.objective && `Objective: ${soapNote.objective}`,
        soapNote.assessment && `Assessment: ${soapNote.assessment}`,
        soapNote.hpi && `HPI: ${soapNote.hpi}`,
        contextText && `Background: ${contextText}`,
      ].filter(Boolean).join("\n\n");
      
      const response = await apiRequest("POST", "/api/ai/differential-search", { caseDetails });
      const data = await response.json();
      setDifferentialResults(data);
      
      toast({
        title: "Differential search complete",
        description: `Found ${data.differentials?.length || 0} potential diagnoses`,
      });
    } catch (error) {
      toast({
        title: "Search failed",
        description: "Could not search differentials",
        variant: "destructive",
      });
    } finally {
      setIsDifferentialSearching(false);
    }
  };

  const handleStopAndTranscribe = async () => {
    const audioBlob = await stopRecording();
    
    // Wait for ondataavailable to fire and queue the final chunk
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Log the state for debugging
    const unprocessedCount = pendingChunksRef.current.filter(c => !c.processed).length;
    console.log(`[HandleStop] Audio blob size: ${audioBlob.size}, Pending chunks: ${pendingChunksRef.current.length}, Unprocessed: ${unprocessedCount}`);
    
    // Check if no chunks were queued (short recording) and no transcript yet
    const hasAnyChunks = pendingChunksRef.current.length > 0;
    const hasTranscript = committedTextRef.current.trim().length > 0;
    
    if (!hasAnyChunks && !hasTranscript && audioBlob.size > 0) {
      queueBackgroundShortRecordingFinalization({
        audioBlob,
        patientName,
        contextText,
        selectedTemplateId,
        resumeMode: isResumeModeRef.current,
        resumeNoteData: resumeNoteDataRef.current,
        sessionDurationSeconds: duration,
        draftRecoveryId: activeDraftIdRef.current,
        speakerSegments:
          structuredSegmentsRef.current.length > 0 ? [...structuredSegmentsRef.current] : undefined,
      });
    } else {
      // Process any remaining chunks
      await finalizeRecording();
    }
  };

  const handleFinishLater = async () => {
    const activeSessionId = recordingSessionIdRef.current;
    const audioBlob = await stopRecording();

    await new Promise((resolve) => setTimeout(resolve, 300));

    setRecordingState("processing");
    addTranscriptEntry("Finishing transcript without generating SOAP...");

    try {
      const hasAnyChunks = pendingChunksRef.current.length > 0;
      const hasTranscript = committedTextRef.current.trim().length > 0;

      if (!hasAnyChunks && !hasTranscript && audioBlob.size > 0) {
        const data = await transcribeShortRecordingOnly(audioBlob);
        const transcriptText = (data.text || data.transcript || "").trim();

        if (!transcriptText) {
          toast({
            title: "No speech detected",
            description: "The recording didn't capture any speech. Please try again.",
            variant: "destructive",
          });
          setRecordingState("idle");
          return;
        }

        addTranscriptEntry(transcriptText, "content");
        committedTextRef.current = committedTextRef.current
          ? `${committedTextRef.current} ${transcriptText}`.trim()
          : transcriptText;
      } else {
        await waitForPendingChunksToFinish(activeSessionId);
      }

      const transcriptSnapshot = committedTextRef.current.trim();
      if (!transcriptSnapshot) {
        toast({
          title: "No speech detected",
          description: "The recording didn't capture any speech. Please try again.",
          variant: "destructive",
        });
        setRecordingState("idle");
        return;
      }

      setSoapNote(null);
      setIsSoapDeferred(true);
      isSoapDeferredRef.current = true;
      setActiveTab("transcript");
      saveBackup(transcriptSnapshot, patientName, "general", {
        contextText,
        source: "manual_defer",
        noteId: resumeNoteDataRef.current?.id ?? null,
        noteTitle: resumeNoteDataRef.current?.title ?? null,
      });
      addTranscriptEntry("SOAP generation deferred. Resume recording after testing or generate when the visit is complete.");
      setRecordingState("idle");

      toast({
        title: "Transcript ready",
        description: "SOAP generation was deferred so you can resume after testing without paying for an extra note run.",
      });
    } catch (error) {
      console.error("Finish later failed:", error);
      toast({
        title: "Could not finish transcript",
        description: "There was an issue finalizing the transcript without SOAP generation.",
        variant: "destructive",
      });
      setRecordingState("idle");
    }
  };

  // AI command handler for "Ask AI to do anything" feature
  const handleAiCommand = async () => {
    if (!aiCommand.trim()) return;
    
    setIsAiProcessing(true);
    try {
      const fullTranscript = committedTextRef.current || transcriptEntries.filter(e => e.type === "content").map(e => e.text).join(" ");
      
      // Build note content based on format (HPI+Plan or SOAP)
      const noteContentSection = soapNote ? (
        soapNote.hpi ? `
Clinical Note:
HPI: ${soapNote.hpi}
Plan: ${soapNote.plan || ''}
` : `
SOAP Note:
Subjective: ${soapNote.subjective || ''}
Objective: ${soapNote.objective || ''}
Assessment: ${soapNote.assessment || ''}
Plan: ${soapNote.plan || ''}
`
      ) : "";
      
      const response = await apiRequest("POST", "/api/ai-assistant", {
        question: aiCommand,
        noteContent: `
Patient: ${patientName || "Not specified"}
Context: ${contextText || "None provided"}
Transcript: ${fullTranscript || "No transcript yet"}
${noteContentSection}
        `.trim(),
      });

      if (!response.ok) {
        throw new Error("AI request failed");
      }

      const data = await response.json();
      
      // Add AI response as a system message
      addTranscriptEntry(`AI Response: ${data.answer}`, "system");
      setAiCommand("");
      
      toast({
        title: "AI Response",
        description: "Check the transcript area for the AI's response",
      });
    } catch (error) {
      toast({
        title: "AI Error",
        description: "Failed to process AI command. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      suppressRecoveryPersistenceRef.current = false;
      setRecordingState("processing");
      addTranscriptEntry("Processing uploaded audio...");
      transcribeMutation.mutate(file);
    }
  };

  useEffect(() => {
    const persistDraftForRecovery = () => {
      if (suppressRecoveryPersistenceRef.current) return;

      const transcriptFromEntries = transcriptEntries
        .filter((entry) => entry.type === "content")
        .map((entry) => entry.text)
        .join(" ")
        .trim();
      const transcript = committedTextRef.current.trim() || transcriptFromEntries;
      if (!transcript) return;

      saveBackup(transcript, patientName, "general");
      if (recordingState === "processing") {
        saveInflightScribeRecovery({
          transcript,
          patientName,
          contextText,
          savedAt: new Date().toISOString(),
          reason: "page-unload",
        });
      }
    };

    window.addEventListener("beforeunload", persistDraftForRecovery);
    window.addEventListener("pagehide", persistDraftForRecovery);
    return () => {
      window.removeEventListener("beforeunload", persistDraftForRecovery);
      window.removeEventListener("pagehide", persistDraftForRecovery);
    };
  }, [contextText, patientName, recordingState, saveBackup, saveInflightScribeRecovery, transcriptEntries]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (backgroundIntervalRef.current) clearInterval(backgroundIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const hasTranscript = transcriptEntries.some((e) => e.type === "content");

  // Handle backup recovery
  const handleRecoverBackup = () => {
    const backup = loadBackup();
    if (backup && backup.transcript) {
      restoreRecoverableDraft({
        id: typeof backup.id === "string" ? backup.id : activeDraftIdRef.current,
        transcript: backup.transcript,
        patientName: typeof backup.patientName === "string" ? backup.patientName : "",
        specialty: typeof backup.specialty === "string" ? backup.specialty : "general",
        contextText: typeof backup.contextText === "string" ? backup.contextText : "",
        savedAt: typeof backup.savedAt === "string" ? backup.savedAt : new Date().toISOString(),
        source: backup.source === "inflight" || backup.source === "manual_defer" || backup.source === "soap_error" ? backup.source : "backup",
        noteId: typeof backup.noteId === "number" ? backup.noteId : null,
        noteTitle: typeof backup.noteTitle === "string" ? backup.noteTitle : null,
      }, "Transcript recovered", "Your previous session has been restored.");
    }
  };

  const restoreRecoverableDraft = (
    draft: RecoverableDraft,
    title = "Draft recovered",
    description = "Your transcript draft has been restored.",
  ) => {
    suppressRecoveryPersistenceRef.current = false;
    activeDraftIdRef.current = draft.id;
    setRecordingState("idle");
    setDuration(0);
    setTranscriptEntries([]);
    setSoapNote(null);
    setActiveTab("transcript");
    setTranscriptPanelOpen(true);
    setPatientName(draft.patientName || "");
    setContextText(draft.contextText || "");
    setIsSoapDeferred(true);
    isSoapDeferredRef.current = true;

    if (draft.noteId) {
      const recoveredResumeNote: ResumeNoteData = {
        id: draft.noteId,
        title: draft.noteTitle || `Recovered note ${draft.noteId}`,
        transcript: draft.transcript,
        patientName: draft.patientName || null,
        patientContext: draft.contextText || null,
      };
      setIsResumeMode(true);
      isResumeModeRef.current = true;
      setResumeNoteData(recoveredResumeNote);
      resumeNoteDataRef.current = recoveredResumeNote;
    } else {
      setIsResumeMode(false);
      isResumeModeRef.current = false;
      setResumeNoteData(null);
      resumeNoteDataRef.current = null;
    }

    committedTextRef.current = draft.transcript;
    partialTextRef.current = "";
    recentLinesRef.current = [];
    lastCumulativeTranscriptRef.current = "";
    structuredSegmentsRef.current = [];

    addTranscriptEntry("--- Recovered transcript draft ---", "system");
    addTranscriptEntry(draft.transcript, "content");
    saveBackup(draft.transcript, draft.patientName || "", draft.specialty || "general", {
      contextText: draft.contextText || "",
      source: draft.source,
      noteId: draft.noteId ?? null,
      noteTitle: draft.noteTitle ?? null,
      draftId: draft.id,
    });

    toast({
      title,
      description,
    });
  };

  const handleRecoverInterruptedScribe = () => {
    if (!interruptedScribeRecovery?.transcript) return;
    restoreRecoverableDraft(
      {
        id: interruptedScribeRecovery.id || activeDraftIdRef.current,
        transcript: interruptedScribeRecovery.transcript,
        patientName: interruptedScribeRecovery.patientName,
        specialty: "general",
        contextText: interruptedScribeRecovery.contextText,
        savedAt: interruptedScribeRecovery.savedAt,
        source: "inflight",
        noteId: interruptedScribeRecovery.noteId ?? null,
        noteTitle: interruptedScribeRecovery.noteTitle ?? null,
      },
      "Interrupted scribe recovered",
      "Your transcript draft is restored. Generate SOAP to continue.",
    );
    clearInflightScribeRecovery();
  };

  const handleManualTranscriptImport = () => {
    const imported = importTranscriptToCurrentSession(manualTranscriptInput, {
      sourceLabel: "manual paste",
    });
    if (!imported) return;
    setManualTranscriptInput("");
    setIsManualImportDialogOpen(false);
  };

  const handleDiscardRecoverableDraft = (draftId: string) => {
    removeRecoverableDraft(draftId);
    const backup = loadBackup();
    if (backup?.id === draftId) {
      clearBackup();
    }
    if (interruptedScribeRecovery?.id === draftId) {
      clearInflightScribeRecovery();
    }
    if (activeDraftIdRef.current === draftId && !hasTranscript) {
      activeDraftIdRef.current = crypto.randomUUID();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Dialog open={isManualImportDialogOpen} onOpenChange={setIsManualImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste transcript</DialogTitle>
            <DialogDescription>
              Import transcript text directly into this new session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="manual-transcript-import">Transcript text</Label>
            <Textarea
              id="manual-transcript-import"
              value={manualTranscriptInput}
              onChange={(event) => setManualTranscriptInput(event.target.value)}
              className="min-h-[200px]"
              placeholder="Paste transcript here..."
              data-testid="textarea-manual-transcript-import"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsManualImportDialogOpen(false)}
              data-testid="button-cancel-manual-transcript-import"
            >
              Cancel
            </Button>
            <Button
              onClick={handleManualTranscriptImport}
              disabled={!manualTranscriptInput.trim()}
              data-testid="button-confirm-manual-transcript-import"
            >
              Import transcript
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRecoverDraftsDialogOpen} onOpenChange={setIsRecoverDraftsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recover transcript drafts</DialogTitle>
            <DialogDescription>
              Restore a recent unsaved transcript if SOAP generation failed, the page refreshed, or you deferred finishing the visit.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {recoverableDrafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recoverable drafts are available.</p>
            ) : recoverableDrafts.map((draft) => (
              <div
                key={draft.id}
                className="rounded-md border p-3 space-y-2"
                data-testid={`recoverable-draft-${draft.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {draft.patientName || draft.noteTitle || "Untitled session"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(draft.savedAt).toLocaleString()} · {draft.source === "manual_defer" ? "Finish later" : draft.source === "soap_error" ? "SOAP failure" : draft.source === "inflight" ? "Interrupted background scribe" : "Draft backup"}
                    </p>
                    {draft.noteTitle && draft.noteId ? (
                      <p className="text-xs text-muted-foreground">Source note: {draft.noteTitle}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDiscardRecoverableDraft(draft.id)}
                      data-testid={`button-discard-draft-${draft.id}`}
                    >
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        restoreRecoverableDraft(draft);
                        setIsRecoverDraftsDialogOpen(false);
                      }}
                      data-testid={`button-recover-draft-${draft.id}`}
                    >
                      Recover
                    </Button>
                  </div>
                </div>
                <p className="line-clamp-4 text-xs text-muted-foreground whitespace-pre-wrap">
                  {draft.transcript}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRecoverDraftsDialogOpen(false)}
              data-testid="button-close-recover-drafts"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {interruptedScribeRecovery && recordingState === "idle" && !hasTranscript && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>Previous background scribe was interrupted. Recover transcript draft?</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={clearInflightScribeRecovery}
              className="h-7 text-xs"
              data-testid="button-discard-interrupted-scribe"
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={handleRecoverInterruptedScribe}
              className="h-7 text-xs"
              data-testid="button-recover-interrupted-scribe"
            >
              Recover
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsRecoverDraftsDialogOpen(true)}
              className="h-7 text-xs"
              data-testid="button-browse-drafts-interrupted"
            >
              Browse drafts
            </Button>
          </div>
        </div>
      )}

      {recoverableDrafts.length > 0 && recordingState === "idle" && !hasTranscript && (
        <div className="bg-sky-50 dark:bg-sky-900/20 border-b border-sky-200 dark:border-sky-800 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sky-800 dark:text-sky-200 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{recoverableDrafts.length} recoverable transcript draft{recoverableDrafts.length === 1 ? "" : "s"} available</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsRecoverDraftsDialogOpen(true)}
            className="h-7 text-xs"
            data-testid="button-browse-recoverable-drafts"
          >
            Browse drafts
          </Button>
        </div>
      )}

      {/* Recovery banner */}
      {hasBackup && recordingState === "idle" && !hasTranscript && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>You have an unsaved transcript from a previous session</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={clearBackup}
              className="h-7 text-xs"
              data-testid="button-discard-backup"
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleRecoverBackup}
              className="h-7 text-xs"
              data-testid="button-recover-backup"
            >
              Recover
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsRecoverDraftsDialogOpen(true)}
              className="h-7 text-xs"
              data-testid="button-browse-drafts-backup"
            >
              Browse drafts
            </Button>
          </div>
        </div>
      )}
      
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add patient details"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-48 h-8"
                data-testid="input-patient-name"
              />
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span>English</span>
            </div>

            {transcriptionProvider && transcriptionProvider.provider === "local" && (
              <Badge
                variant="default"
                className="h-6 text-[11px] uppercase tracking-wide"
                title={transcriptionProvider.reason || `Configured provider: ${transcriptionProvider.configuredProvider}`}
                data-testid="badge-transcription-provider"
              >
                Local STT
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>{formatTime(duration)}</span>
            </div>

            {/* Transcribe button - fixed width for consistent sizing */}
            {recordingState === "idle" && (
              <Button
                size="sm"
                onClick={startRecording}
                className="gap-1.5 h-8 w-24 justify-center"
                data-testid="button-start-recording-header"
              >
                <Mic className="h-4 w-4" />
                {hasTranscript ? "Resume" : "Transcribe"}
              </Button>
            )}
            {recordingState === "recording" && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={pauseRecording}
                  className="h-8 w-8 p-0"
                  data-testid="button-pause-header"
                >
                  <Pause className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleStopAndTranscribe}
                  className="h-8 w-24 justify-center gap-1.5"
                  data-testid="button-stop-header"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              </div>
            )}
            {recordingState === "paused" && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  onClick={resumeRecording}
                  className="h-8 w-24 justify-center gap-1.5"
                  data-testid="button-resume-header"
                >
                  <Play className="h-4 w-4" />
                  Resume
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleFinishLater}
                  className="h-8 justify-center gap-1.5"
                  data-testid="button-finish-later-header"
                >
                  Finish Later
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleStopAndTranscribe}
                  className="h-8 w-24 justify-center gap-1.5"
                  data-testid="button-stop-header"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              </div>
            )}
            {recordingState === "processing" && (
              <Button size="sm" disabled className="h-8 w-24 justify-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                Wait...
              </Button>
            )}
            
            {(recordingState === "recording" || recordingState === "paused") && (
              <Button
                size="sm"
                variant={currentSpeaker === "clinician" ? "default" : "outline"}
                onClick={() => setCurrentSpeaker(prev => prev === "clinician" ? "patient" : "clinician")}
                className="h-8 gap-1 text-xs"
                data-testid="button-speaker-toggle"
                title="Toggle speaker (Ctrl+Shift+S)"
              >
                {currentSpeaker === "clinician" ? (
                  <Stethoscope className="h-3.5 w-3.5" />
                ) : (
                  <UserRound className="h-3.5 w-3.5" />
                )}
                {currentSpeaker === "clinician" ? "Clinician" : "Patient"}
              </Button>
            )}

            {/* Microphone selection dropdown with audio-responsive icon */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground overflow-visible" 
                  data-testid="button-mic-settings"
                >
                  <Mic 
                    className="h-4 w-4 transition-transform duration-75"
                    style={{
                      transform: recordingState === "recording" 
                        ? `scale(${1 + Math.max(...audioLevel) * 0.6})` 
                        : "scale(1)",
                      color: recordingState === "recording" && Math.max(...audioLevel) > 0.1 
                        ? "hsl(var(--primary))" 
                        : undefined
                    }}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Mic className="h-4 w-4" />
                  Select Microphone
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableMicrophones.length > 0 ? (
                  availableMicrophones.map((mic) => (
                    <DropdownMenuItem
                      key={mic.deviceId}
                      onClick={() => setSelectedMicrophoneId(mic.deviceId)}
                      className="flex items-center gap-2"
                      data-testid={`mic-option-${mic.deviceId.slice(0, 8)}`}
                    >
                      <div className={`w-2 h-2 rounded-full ${selectedMicrophoneId === mic.deviceId ? "bg-primary" : "bg-transparent"}`} />
                      <span className="truncate">{mic.label || `Microphone ${availableMicrophones.indexOf(mic) + 1}`}</span>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>
                    No microphones detected
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <ThemeToggle />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t">
          <div className="flex items-center gap-2">
            {/* Content tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-8">
                <TabsTrigger value="context" className="text-xs px-3" data-testid="tab-context">
                  <FileText className="h-3 w-3 mr-1" />
                  Context
                </TabsTrigger>
                <TabsTrigger value="transcript" className="text-xs px-3" data-testid="tab-transcript">
                  <AudioLines className="h-3 w-3 mr-1" />
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="soap" className="text-xs px-3" data-testid="tab-soap" disabled={!soapNote}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  SOAP
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2">
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="h-8 w-40" data-testid="select-template">
                <SelectValue placeholder="Template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default Template</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id.toString()}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button variant="outline" size="sm" className="h-8" data-testid="button-copy">
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex">
        {/* Main content area */}
        <div className={`flex-1 overflow-hidden ${soapNote && hasTranscript ? '' : 'w-full'}`}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <main className="flex-1 overflow-auto p-6">
              <div className="max-w-3xl mx-auto">
                {/* Context Tab */}
                <TabsContent value="context" className="mt-0 space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Patient Background & Context</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add relevant patient history, medications, allergies, or other background information. 
                    This context will be used by the AI when generating clinical notes.
                  </p>
                  <Textarea
                    value={contextText}
                    onChange={(e) => setContextText(e.target.value)}
                    placeholder="e.g., Patient has history of Type 2 Diabetes (diagnosed 2019), on Metformin 1000mg BID. Previous allergic reaction to Penicillin. Last HbA1c: 7.2% (Jan 2024)."
                    className="min-h-[200px] text-base leading-relaxed"
                    data-testid="textarea-context"
                  />
                </div>
                
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium text-sm mb-2">Tips for effective context</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>- Past medical history relevant to today's visit</li>
                    <li>- Current medications and dosages</li>
                    <li>- Known allergies or drug reactions</li>
                    <li>- Recent test results or imaging findings</li>
                    <li>- Relevant family or social history</li>
                  </ul>
                </div>
              </TabsContent>

              {/* Transcript Tab */}
              <TabsContent value="transcript" className="mt-0">
                {transcriptEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                    <AudioLines className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h2 className="text-xl font-medium mb-2">Ready to start your session</h2>
                    <p className="text-muted-foreground mb-6">
                      Click Transcribe in the header to begin recording
                    </p>
                    <div className="flex items-center gap-2">
                      <Select value={visitMode} onValueChange={(v: VisitMode) => setVisitMode(v)}>
                        <SelectTrigger className="w-[200px]" data-testid="select-visit-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transcribing">Transcribing</SelectItem>
                          <SelectItem value="dictating">Dictating</SelectItem>
                          <SelectItem value="upload">Upload session audio</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Button 
                        onClick={() => {
                          if (visitMode === "upload") {
                            fileInputRef.current?.click();
                          } else {
                            startRecording();
                          }
                        }}
                        className="gap-2"
                        data-testid="button-start-session"
                      >
                        {visitMode === "upload" ? (
                          <>
                            <Upload className="h-4 w-4" />
                            Upload
                          </>
                        ) : (
                          <>
                            <Mic className="h-4 w-4" />
                            Start
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setIsManualImportDialogOpen(true)}
                        data-testid="button-open-manual-transcript-import"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Paste transcript
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {transcriptEntries.map((entry, index) => (
                      <div key={index} className={entry.type === "system" ? "text-muted-foreground text-sm" : ""}>
                        {entry.type === "system" ? (
                          <p className="italic text-xs">{entry.text} {entry.timestamp}</p>
                        ) : (
                          <div className="bg-muted/30 rounded-lg p-4">
                            <Textarea
                              value={entry.text}
                              onChange={(e) => {
                                const newText = e.target.value;
                                setTranscriptEntries((prev) => {
                                  const updated = prev.map((ent, i) => i === index ? { ...ent, text: newText } : ent);
                                  // Update committed text for SOAP generation using the updated entries
                                  committedTextRef.current = updated
                                    .filter((e) => e.type === "content")
                                    .map((e) => e.text)
                                    .join(" ");
                                  // Save backup
                                  saveBackup(committedTextRef.current, patientName, "general");
                                  return updated;
                                });
                              }}
                              className="w-full min-h-[60px] resize-none border-0 bg-transparent p-0 text-base leading-relaxed focus-visible:ring-0"
                              placeholder="Edit transcript..."
                              data-testid={`textarea-transcript-${index}`}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {/* Add text button */}
                    {recordingState === "idle" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newEntry: TranscriptEntry = {
                            timestamp: new Date().toLocaleTimeString(),
                            text: "",
                            type: "content"
                          };
                          setTranscriptEntries((prev) => [...prev, newEntry]);
                        }}
                        className="w-full"
                        data-testid="button-add-transcript-text"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add text
                      </Button>
                    )}
                    
                    {recordingState === "recording" && (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                        Listening...
                      </div>
                    )}
                    {recordingState === "processing" && (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing...
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* SOAP Tab */}
              <TabsContent value="soap" className="mt-0">
                {soapNote ? (
                  <div className="space-y-4">
                    <DrugInteractionAlert 
                      text={`${soapNote.subjective || ''} ${soapNote.objective || ''} ${soapNote.assessment || ''} ${soapNote.plan || ''} ${soapNote.hpi || ''}`} 
                    />
                    {canViewSoapDebug && soapDebugInfo ? (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground" data-testid="text-soap-debug-model">
                          {formatSoapDebugLabel(soapDebugInfo)}
                        </p>
                        {formatSoapDebugSecondary(soapDebugInfo) ? (
                          <p className="text-xs text-muted-foreground/80" data-testid="text-soap-debug-detail">
                            {formatSoapDebugSecondary(soapDebugInfo)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    
                    {/* Dynamically show sections based on what the AI returned */}
                    {(soapNote.hpi ? [
                      { key: "hpi", label: "HPI" },
                      { key: "plan", label: "Plan" },
                    ] : [
                      { key: "subjective", label: "Subjective" },
                      { key: "objective", label: "Objective" },
                      { key: "assessment", label: "Assessment" },
                      { key: "plan", label: "Plan" },
                    ]).filter(({ key }) => soapNote[key] && typeof soapNote[key] === 'string').map(({ key, label }) => (
                      <div key={key}>
                        <h3 className="font-medium text-sm mb-1">{label}</h3>
                        <MedicalAutocomplete
                          value={(soapNote[key] as string) || ''}
                          onChange={(value) =>
                            setSoapNote((prev) =>
                              prev ? { ...prev, [key]: value } : null
                            )
                          }
                          className="min-h-[100px] text-base"
                          rows={4}
                          data-testid={`textarea-${key}`}
                        />
                      </div>
                    ))}
                    
                    {/* AI Differential Search Button */}
                    <Button
                      variant="outline"
                      onClick={searchDifferentials}
                      disabled={isDifferentialSearching}
                      className="w-full"
                      data-testid="button-differential-search"
                    >
                      {isDifferentialSearching ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Search Differentials & Labs
                        </>
                      )}
                    </Button>
                    
                    {/* Differential Results */}
                    {differentialResults && (
                      <div className="space-y-4 pt-4 border-t">
                        <h3 className="font-semibold text-base flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          AI Clinical Decision Support
                        </h3>
                        
                        {/* Differentials */}
                        {differentialResults.differentials?.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">Differential Diagnoses</h4>
                            <div className="space-y-2">
                              {differentialResults.differentials.map((d, i) => (
                                <div key={i} className="bg-muted/50 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium">{d.diagnosis}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      d.likelihood === "High" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                      d.likelihood === "Medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                                      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    }`}>
                                      {d.likelihood}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground">{d.rationale}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Labs */}
                        {differentialResults.recommendedLabs?.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">Recommended Labs & Tests</h4>
                            <div className="space-y-2">
                              {differentialResults.recommendedLabs.map((lab, i) => (
                                <div key={i} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                                  <span className="font-medium text-blue-700 dark:text-blue-400">{lab.test}</span>
                                  <p className="text-sm text-muted-foreground mt-1">{lab.purpose}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Red Flags */}
                        {differentialResults.redFlags?.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2 text-red-600 dark:text-red-400">Red Flags</h4>
                            <ul className="list-disc list-inside text-sm space-y-1">
                              {differentialResults.redFlags.map((flag, i) => (
                                <li key={i} className="text-red-600 dark:text-red-400">{flag}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Clinical Pearls */}
                        {differentialResults.clinicalPearls?.length > 0 && (
                          <div>
                            <h4 className="font-medium text-sm mb-2">Clinical Pearls</h4>
                            <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                              {differentialResults.clinicalPearls.map((pearl, i) => (
                                <li key={i}>{pearl}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* ICD-10 & CPT Codes Section */}
                    {soapNote.icdCodes && (soapNote.icdCodes.codes?.length || soapNote.icdCodes.cptCodes?.length || soapNote.icdCodes.priorAuthDxCodes?.length) ? (
                      <div className="mt-6 border-t pt-4">
                        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Billing Codes
                        </h3>
                        {soapNote.icdCodes.visitTimeMinutes ? (
                          <div className="mb-3 rounded-md border bg-muted/30 px-3 py-2 text-sm" data-testid="text-billing-visit-time">
                            Total time for billing: <span className="font-medium">{soapNote.icdCodes.visitTimeMinutes} minutes</span>
                          </div>
                        ) : null}
                        
                        {/* ICD-10 Codes */}
                        {soapNote.icdCodes.codes && soapNote.icdCodes.codes.length > 0 && (
                          <div className="mb-4">
                            <h4 className="font-medium text-xs text-muted-foreground mb-2">ICD-10 Diagnosis Codes</h4>
                            <div className="space-y-2">
                              {soapNote.icdCodes.codes.map((code, i) => (
                                <div key={i} className="flex items-start gap-3 bg-muted/50 rounded-lg p-3">
                                  <span className="font-mono text-sm font-bold text-primary whitespace-nowrap">{code.code}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm">{code.description}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        code.category === "primary" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                                      }`}>
                                        {code.category}
                                      </span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        code.confidence === "high" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                        code.confidence === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                                        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                      }`}>
                                        {code.confidence} confidence
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* CPT Codes */}
                        {soapNote.icdCodes.cptCodes && soapNote.icdCodes.cptCodes.length > 0 && (
                          <div>
                            <h4 className="font-medium text-xs text-muted-foreground mb-2">CPT E/M Codes</h4>
                            <div className="space-y-2">
                              {soapNote.icdCodes.cptCodes.map((cpt, i) => (
                                <div key={i} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">{cpt.code}</span>
                                    <span className="text-sm">{cpt.description}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">{cpt.rationale}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {soapNote.icdCodes.priorAuthDxCodes && soapNote.icdCodes.priorAuthDxCodes.length > 0 && (
                          <div className="mt-4">
                            <h4 className="font-medium text-xs text-muted-foreground mb-2">Likely Prior Authorization Dx Codes</h4>
                            <div className="space-y-2">
                              {soapNote.icdCodes.priorAuthDxCodes.map((paCode, i) => (
                                <div key={`pa-${i}`} className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3">
                                  <div className="flex items-start gap-2">
                                    <span className="font-mono text-sm font-bold text-amber-700 dark:text-amber-300">{paCode.code}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm">{paCode.description}</p>
                                      {paCode.medication ? (
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Medication: {paCode.medication}
                                        </p>
                                      ) : null}
                                      {paCode.rationale ? (
                                        <p className="text-xs text-muted-foreground mt-1">{paCode.rationale}</p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[50vh] text-center">
                    <Sparkles className="h-16 w-16 text-muted-foreground/30 mb-4" />
                    <h2 className="text-xl font-medium mb-2">No SOAP note yet</h2>
                    <p className="text-muted-foreground">
                      Record a transcript first, then click "Generate SOAP"
                    </p>
                  </div>
                )}
              </TabsContent>
              </div>
            </main>
          </Tabs>
        </div>

        {/* Collapsible Transcript Panel - shown when SOAP exists and transcript is available */}
        {soapNote && hasTranscript && (
          <div className={`border-l bg-muted/30 flex flex-col transition-all duration-300 ${transcriptPanelOpen ? 'w-80' : 'w-10'}`}>
            {/* Panel toggle button */}
            <button
              onClick={() => setTranscriptPanelOpen(!transcriptPanelOpen)}
              className="p-2 hover:bg-muted border-b flex items-center justify-center"
              data-testid="button-toggle-transcript-panel"
            >
              {transcriptPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </button>
            
            {/* Panel content */}
            {transcriptPanelOpen && (
              <div className="flex-1 overflow-auto p-3">
                <h3 className="font-medium text-sm mb-2">Transcript</h3>
                <div className="space-y-2">
                  {transcriptEntries
                    .filter((e) => e.type === "content")
                    .map((entry, index) => (
                      <div key={index} className="bg-background rounded p-2 text-sm">
                        <p className="whitespace-pre-wrap">{entry.text}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="border-t bg-background p-3">
        {/* Hidden file input for upload */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="audio/*"
          className="hidden"
        />
        
        {/* Action buttons row */}
        <div className="flex items-center justify-center gap-3 mb-3">
          {hasTranscript && recordingState === "idle" && (
            <>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
                data-testid="button-add-audio"
              >
                <Upload className="h-4 w-4" />
                Add Audio
              </Button>
              
              <Button
                variant="default"
                onClick={() => generateSoapMutation.mutate()}
                disabled={generateSoapMutation.isPending}
                className="gap-2"
                data-testid="button-generate-soap"
              >
                {generateSoapMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {soapNote ? "Regenerate SOAP" : "Generate SOAP"}
              </Button>

              <Button
                variant="outline"
                onClick={() => void queueSessionDraftForLater()}
                className="gap-2"
                data-testid="button-next-patient"
              >
                <Plus className="h-4 w-4" />
                Next Patient
              </Button>
              
              {soapNote && (
                <Button
                  variant="secondary"
                  onClick={() => saveNoteMutation.mutate()}
                  disabled={saveNoteMutation.isPending}
                  className="gap-2"
                  data-testid="button-save-session"
                >
                  {saveNoteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save Session"
                  )}
                </Button>
              )}
            </>
          )}
        </div>
        {isSoapDeferred && hasTranscript && recordingState === "idle" && (
          <p className="mb-3 text-center text-xs text-muted-foreground" data-testid="text-soap-deferred-hint">
            SOAP generation is deferred. Resume recording after testing, or generate the note when the visit is complete.
          </p>
        )}
        
        {/* Ask AI to do anything - persistent input bar */}
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <div className="flex-1 relative">
            <Wand2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={aiCommand}
              onChange={(e) => setAiCommand(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isAiProcessing && handleAiCommand()}
              placeholder="Ask AI to do anything..."
              className="pl-10 h-9"
              disabled={isAiProcessing}
              data-testid="input-ai-command"
            />
          </div>
          <Button 
            size="icon" 
            onClick={handleAiCommand} 
            disabled={isAiProcessing || !aiCommand.trim()}
            className="h-9 w-9"
            data-testid="button-send-ai-command"
          >
            {isAiProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </footer>
    </div>
  );
}
