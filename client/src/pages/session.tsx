import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
  const autoStartRecording = urlParams.get("autoStart") === "true";
  const [isResumeMode, setIsResumeMode] = useState(!!resumeNoteId);
  const [resumeNoteData, setResumeNoteData] = useState<{
    id: number;
    title: string;
    transcript: string;
    patientName: string | null;
    patientContext: string | null;
  } | null>(null);
  
  // Refs to avoid stale closures in async callbacks
  const isResumeModeRef = useRef(!!resumeNoteId);
  const resumeNoteDataRef = useRef<typeof resumeNoteData>(null);
  const hasAutoStartedRef = useRef(false);
  const startRecordingRef = useRef<(() => Promise<void>) | null>(null);

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
    [key: string]: string | undefined;
  } | null>(null);
  
  // New features: Visit mode, Context, AI command
  const [visitMode, setVisitMode] = useState<VisitMode>("transcribing");
  const [contextText, setContextText] = useState("");
  const [aiCommand, setAiCommand] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);

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
  
  // Chunk tracking with unique IDs to prevent duplicate processing
  type ChunkItem = { id: number; blob: Blob; processed: boolean; timestampSec: number };
  const pendingChunksRef = useRef<ChunkItem[]>([]);
  const nextChunkIdRef = useRef<number>(0);
  const processedChunkIdsRef = useRef<Set<number>>(new Set());
  const chunkIntervalSec = 5; // 5-second chunks for faster feedback with timestamps
  
  // Transcript state: committedText (stable) + partialText (interim)
  const committedTextRef = useRef<string>(""); // Finalized transcript
  const partialTextRef = useRef<string>(""); // Current interim fragment (not yet finalized)
  const recentLinesRef = useRef<string[]>([]); // Rolling window for dedup (last 20 lines)
  const lastCumulativeTranscriptRef = useRef<string>(""); // Track cumulative transcript for delta extraction
  
  // Backup system - saves transcript to localStorage after each chunk
  const BACKUP_KEY = "docuwhisper_transcript_backup";
  const [hasBackup, setHasBackup] = useState(false);
  const [transcriptPanelOpen, setTranscriptPanelOpen] = useState(true);
  
  const saveBackup = useCallback((transcript: string, patientName: string, specialty: string) => {
    if (transcript && transcript.trim()) {
      const backup = {
        transcript: transcript.trim(),
        patientName,
        specialty,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
      console.log(`[Backup] Saved ${transcript.length} chars to localStorage`);
    }
  }, []);
  
  const loadBackup = useCallback(() => {
    try {
      const saved = localStorage.getItem(BACKUP_KEY);
      if (saved) {
        return JSON.parse(saved);
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
  
  // Check for existing backup on mount
  useEffect(() => {
    const backup = loadBackup();
    if (backup && backup.transcript) {
      setHasBackup(true);
    }
  }, [loadBackup]);

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
          };
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

  // Fetch user settings for language preference
  const { data: userSettings } = useQuery<{
    language?: string;
    autoSaveEnabled?: boolean;
    defaultTemplateId?: number;
  }>({
    queryKey: ["/api/settings"],
  });

  // Get language from settings (default to English)
  const transcriptionLanguage = userSettings?.language || "en";

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

  const transcribeChunk = async (audioBlob: Blob): Promise<string | null> => {
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "chunk.webm");
      formData.append("language", transcriptionLanguage);

      console.log(`[transcribeChunk] Starting transcription of ${audioBlob.size} bytes`);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        credentials: "include",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.error("Chunk transcription failed with status:", response.status);
        return null;
      }

      const data = await response.json();
      console.log(`[transcribeChunk] Completed, got ${data.transcript?.length || 0} chars`);
      return data.transcript || null;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        console.error("Chunk transcription timed out after 60 seconds");
      } else {
        console.error("Chunk transcription error:", error);
      }
      return null;
    }
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

  const processNextChunk = async () => {
    // Find next unprocessed chunk
    const chunkItem = pendingChunksRef.current.find(c => !c.processed);
    const pendingCount = pendingChunksRef.current.length;
    const unprocessedCount = pendingChunksRef.current.filter(c => !c.processed).length;
    console.log(`[processNextChunk] Called. Pending: ${pendingCount}, Unprocessed: ${unprocessedCount}, isTranscribing: ${isTranscribingRef.current}`);
    
    if (!chunkItem) {
      console.log("[Chunk] No unprocessed chunks remaining");
      return;
    }
    if (isTranscribingRef.current) {
      console.log(`[Chunk] Already transcribing, chunk ${chunkItem.id} will be picked up when current finishes`);
      return;
    }
    
    // Check if already processed (belt + suspenders)
    if (processedChunkIdsRef.current.has(chunkItem.id)) {
      console.log(`[Chunk ${chunkItem.id}] Already in processed set, skipping`);
      chunkItem.processed = true;
      processNextChunk();
      return;
    }

    // Mark as "in progress" - but NOT processed yet
    isTranscribingRef.current = true;
    processedChunkIdsRef.current.add(chunkItem.id);
    
    console.log(`[Chunk ${chunkItem.id}] Processing ${chunkItem.blob.size} bytes (independent segment)...`);
    
    try {
      // Each chunk is now independent - just the audio from this time segment
      const transcriptText = await transcribeChunk(chunkItem.blob);
      
      if (transcriptText && transcriptText.trim()) {
        const cleanedText = transcriptText.trim();
        
        // Add the transcript directly - it's independent audio, not cumulative
        const added = addTranscriptContent(cleanedText, chunkItem.timestampSec);
        console.log(`[Chunk ${chunkItem.id}] Transcribed ${cleanedText.length} chars: ${added ? 'ADDED' : 'DROPPED as duplicate'}`);
        
        if (added) {
          // Auto-backup after each successful chunk
          saveBackup(committedTextRef.current, patientName, "general");
        }
      } else {
        console.log(`[Chunk ${chunkItem.id}] No transcript returned (empty audio segment)`);
      }
    } catch (err) {
      console.error(`[Chunk ${chunkItem.id}] Transcription error:`, err);
    }

    // NOW mark as processed (after transcription completes)
    chunkItem.processed = true;
    isTranscribingRef.current = false;
    
    // Process next if any remain
    const remaining = pendingChunksRef.current.filter(c => !c.processed);
    console.log(`[Chunk] ${remaining.length} chunks remaining to process`);
    if (remaining.length > 0) {
      processNextChunk();
    }
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
      
      animationRef.current = requestAnimationFrame(updateAudioLevel);
    }
  }, [setGlobalAudioLevel]);

  const startRecording = async () => {
    try {
      // Use selected microphone if available
      const audioConstraints = selectedMicrophoneId 
        ? { deviceId: { exact: selectedMicrophoneId } } 
        : {};
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      chunksRef.current = [];
      pendingChunksRef.current = [];
      nextChunkIdRef.current = 0;
      processedChunkIdsRef.current.clear();
      
      // Reset transcript state - but PRESERVE existing transcript in resume mode
      // Use refs to avoid stale closure issues
      if (!isResumeModeRef.current || !resumeNoteDataRef.current?.transcript) {
        committedTextRef.current = "";
      }
      // Always reset these - they're for new recording session
      partialTextRef.current = "";
      recentLinesRef.current = [];
      lastCumulativeTranscriptRef.current = "";
      
      // SEGMENTED RECORDING APPROACH:
      // Instead of relying on timeslice mode (which has browser quirks),
      // we use a segmented approach where we create independent recorder sessions
      // every 20 seconds. Each segment is a complete, valid audio file.
      
      let segmentChunks: Blob[] = [];
      let segmentInterval: NodeJS.Timeout | null = null;
      let currentRecorder: MediaRecorder | null = null;
      
      const createSegmentRecorder = () => {
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
            // Create complete audio blob from this segment
            const segmentBlob = new Blob(segmentChunks, { type: recorder.mimeType || 'audio/webm' });
            
            // Store for final assembly
            chunksRef.current.push(segmentBlob);
            
            // Queue for transcription
            const chunkId = nextChunkIdRef.current++;
            const timestampSec = chunkId * chunkIntervalSec;
            const chunkItem: ChunkItem = { 
              id: chunkId, 
              blob: segmentBlob, 
              processed: false, 
              timestampSec 
            };
            pendingChunksRef.current.push(chunkItem);
            console.log(`[Chunk ${chunkId}] Queued segment at ${formatTime(timestampSec)} (${segmentBlob.size} bytes)`);
            
            // Process transcription
            processNextChunk();
          }
          
          // Reset for next segment
          segmentChunks = [];
        };
        
        recorder.onerror = (event) => {
          console.error("[Segment] Recorder error:", event);
        };
        
        return recorder;
      };
      
      // Function to cycle to next segment (stop current, start new)
      const cycleSegment = () => {
        console.log("[Segment] Cycling to next segment...");
        
        if (currentRecorder && currentRecorder.state === "recording") {
          // Stop current recorder - this triggers onstop handler
          currentRecorder.stop();
        }
        
        // Create and start new recorder
        currentRecorder = createSegmentRecorder();
        currentRecorder.start();
        mediaRecorderRef.current = currentRecorder;
        console.log("[Segment] New segment started, state:", currentRecorder.state);
      };
      
      // Start first segment
      currentRecorder = createSegmentRecorder();
      currentRecorder.start();
      mediaRecorderRef.current = currentRecorder;
      console.log("[Segment] First segment started");
      
      // Cycle to new segment every 20 seconds
      segmentInterval = setInterval(cycleSegment, chunkIntervalSec * 1000);
      
      // Store interval ref for cleanup
      (streamRef.current as any)._segmentInterval = segmentInterval;
      
      isRecordingRef.current = true;
      setRecordingState("recording");
      setGlobalRecording(true);
      setDuration(0);
      addTranscriptEntry("Listening... transcript will appear as you speak");

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      animationRef.current = requestAnimationFrame(updateAudioLevel);

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
      
      // Stop the segment interval when pausing
      if (streamRef.current && (streamRef.current as any)._segmentInterval) {
        clearInterval((streamRef.current as any)._segmentInterval);
        (streamRef.current as any)._segmentInterval = null;
        console.log("[Pause] Segment interval paused");
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
      setAudioLevel([0, 0, 0, 0, 0]);
      setGlobalAudioLevel([0, 0, 0, 0, 0]);
    }
  };

  const resumeRecording = () => {
    if (streamRef.current && recordingState === "paused") {
      // Create a new segment recorder to resume
      const stream = streamRef.current;
      
      let segmentChunks: Blob[] = [];
      
      const createSegmentRecorder = () => {
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
            const segmentBlob = new Blob(segmentChunks, { type: recorder.mimeType || 'audio/webm' });
            chunksRef.current.push(segmentBlob);
            
            const chunkId = nextChunkIdRef.current++;
            const timestampSec = chunkId * chunkIntervalSec;
            const chunkItem: ChunkItem = { 
              id: chunkId, 
              blob: segmentBlob, 
              processed: false, 
              timestampSec 
            };
            pendingChunksRef.current.push(chunkItem);
            console.log(`[Chunk ${chunkId}] Queued resumed segment (${segmentBlob.size} bytes)`);
            processNextChunk();
          }
          segmentChunks = [];
        };
        
        return recorder;
      };
      
      let currentRecorder = createSegmentRecorder();
      
      const cycleSegment = () => {
        console.log("[Segment Resume] Cycling segment...");
        if (currentRecorder && currentRecorder.state === "recording") {
          currentRecorder.stop();
        }
        currentRecorder = createSegmentRecorder();
        currentRecorder.start();
        mediaRecorderRef.current = currentRecorder;
      };
      
      // Start new segment
      currentRecorder.start();
      mediaRecorderRef.current = currentRecorder;
      console.log("[Resume] New segment started");
      
      // Restart segment cycling
      const segmentInterval = setInterval(cycleSegment, chunkIntervalSec * 1000);
      (streamRef.current as any)._segmentInterval = segmentInterval;
      
      isRecordingRef.current = true;
      setRecordingState("recording");
      setGlobalRecording(true);
      addTranscriptEntry("Transcript resumed");
      
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
      
      animationRef.current = requestAnimationFrame(updateAudioLevel);
    }
  };

  const stopRecording = () => {
    return new Promise<Blob>((resolve) => {
      // Clean up segment interval
      if (streamRef.current && (streamRef.current as any)._segmentInterval) {
        clearInterval((streamRef.current as any)._segmentInterval);
        (streamRef.current as any)._segmentInterval = null;
        console.log("[Stop] Segment interval cleared");
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

      setAudioLevel([0, 0, 0, 0, 0]);
      addTranscriptEntry("Transcript stopped");
    });
  };

  const generateTitleMutation = useMutation({
    mutationFn: async (transcript: string) => {
      const response = await apiRequest("POST", "/api/generate-title", { transcript });
      return response.json();
    },
  });

  const finalizeRecording = async () => {
    setRecordingState("processing");
    addTranscriptEntry("Finishing transcription...");

    try {
      processNextChunk();
      
      // Wait for all chunks to be processed
      const hasUnprocessedChunks = () => pendingChunksRef.current.some(c => !c.processed);
      
      let waitCount = 0;
      const maxWait = 120;
      while ((isTranscribingRef.current || hasUnprocessedChunks()) && waitCount < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 500));
        waitCount++;
        if (!isTranscribingRef.current && hasUnprocessedChunks()) {
          processNextChunk();
        }
      }
      
      if (waitCount >= maxWait) {
        console.warn("Transcription timeout - using available chunks");
      }

      // Finalize any pending partial text
      finalizePartial();
      const fullTranscript = committedTextRef.current;
      
      if (!fullTranscript.trim()) {
        toast({
          title: "No speech detected",
          description: "The recording didn't capture any speech. Please try again.",
          variant: "destructive",
        });
        setRecordingState("idle");
        return;
      }

      // Auto-generate SOAP and save
      addTranscriptEntry("Generating SOAP note...");
      await autoGenerateAndSave(fullTranscript);

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
  const autoGenerateAndSave = async (transcript: string) => {
    try {
      // Step 1: Generate SOAP note
      const soapResponse = await apiRequest("POST", "/api/generate-soap", {
        transcript,
        patientName,
        specialty: "general",
        templateId: selectedTemplateId !== "default" ? parseInt(selectedTemplateId) : undefined,
        outputLanguage: transcriptionLanguage,
        context: contextText || undefined,
      });
      const soapData = await soapResponse.json();
      setSoapNote(soapData);

      addTranscriptEntry("Saving note...");

      let savedNoteId: number;

      // Use refs to avoid stale closure issues
      const currentIsResumeMode = isResumeModeRef.current;
      const currentResumeNoteData = resumeNoteDataRef.current;
      console.log("[Save] isResumeMode (ref):", currentIsResumeMode, "resumeNoteData (ref):", currentResumeNoteData);
      
      if (currentIsResumeMode && currentResumeNoteData) {
        // Update existing note (resume mode)
        // Map HPI format to SOAP fields for storage (HPI combines S+O+A)
        const noteData = soapData.hpi ? {
          subjective: soapData.hpi,
          objective: "",
          assessment: "",
          plan: soapData.plan || "",
        } : {
          subjective: soapData.subjective || "",
          objective: soapData.objective || "",
          assessment: soapData.assessment || "",
          plan: soapData.plan || "",
        };
        console.log("[Save] HPI format detected:", !!soapData.hpi, "Saving noteData:", noteData);
        
        const updateResponse = await apiRequest("PATCH", `/api/notes/${currentResumeNoteData.id}`, {
          ...noteData,
          transcript,
          patientContext: contextText || null,
        });
        await updateResponse.json();
        savedNoteId = currentResumeNoteData.id;
        
        toast({
          title: "Session updated",
          description: "Your additional recording has been added.",
        });
      } else {
        // Create new note
        let title: string;
        if (patientName) {
          title = `${patientName} - ${new Date().toLocaleDateString()}`;
        } else if (transcript.trim()) {
          try {
            const titleResponse = await apiRequest("POST", "/api/generate-title", { transcript });
            const titleData = await titleResponse.json();
            title = titleData.title || `Session - ${new Date().toLocaleDateString()}`;
          } catch {
            title = `Session - ${new Date().toLocaleDateString()}`;
          }
        } else {
          title = `Session - ${new Date().toLocaleDateString()}`;
        }

        // Map HPI format to SOAP fields for storage (HPI combines S+O+A)
        const noteData = soapData.hpi ? {
          subjective: soapData.hpi,
          objective: "",
          assessment: "",
          plan: soapData.plan || "",
        } : {
          subjective: soapData.subjective || "",
          objective: soapData.objective || "",
          assessment: soapData.assessment || "",
          plan: soapData.plan || "",
        };
        console.log("[Save New] HPI format detected:", !!soapData.hpi, "Saving noteData:", noteData);

        const saveResponse = await apiRequest("POST", "/api/notes", {
          title,
          patientName,
          specialty: "general",
          ...noteData,
          transcript,
          patientContext: contextText || null,
        });
        const savedNote = await saveResponse.json();
        savedNoteId = savedNote.id;
        
        toast({
          title: "Session complete",
          description: "Your note has been saved automatically.",
        });
      }

      // Clear backup and navigate to saved note
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", savedNoteId.toString()] });
      clearBackup();

      navigate(`/notes/${savedNoteId}`);

    } catch (error) {
      console.error("Auto-save failed:", error);
      toast({
        title: "Auto-save failed",
        description: "Please try saving manually.",
        variant: "destructive",
      });
      setRecordingState("idle");
    }
  };

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
        
        // Auto-generate SOAP and save
        addTranscriptEntry("Generating SOAP note...");
        await autoGenerateAndSave(committedTextRef.current);
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
      const response = await apiRequest("POST", "/api/generate-soap", {
        transcript,
        patientName,
        specialty: "general",
        templateId: selectedTemplateId !== "default" ? parseInt(selectedTemplateId) : undefined,
        outputLanguage: transcriptionLanguage,
        context: contextText || undefined,
      });
      const data = await response.json();
      console.log("[Regenerate] Received response:", data);
      console.log("[Regenerate] Response keys:", Object.keys(data));
      return data;
    },
    onSuccess: (data) => {
      console.log("[Regenerate] Setting soapNote state:", data);
      setSoapNote(data);
      setActiveTab("soap");
      setTranscriptPanelOpen(false); // Collapse transcript panel when SOAP is generated
    },
    onError: () => {
      toast({
        title: "SOAP generation failed",
        description: "Please try again",
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

      // Generate title: use patient name if provided, otherwise auto-generate from transcript
      let title: string;
      if (patientName) {
        title = `${patientName} - ${new Date().toLocaleDateString()}`;
      } else if (transcript.trim()) {
        // Auto-generate title from chief complaint/symptoms
        try {
          const titleResponse = await apiRequest("POST", "/api/generate-title", { transcript });
          const titleData = await titleResponse.json();
          title = titleData.title || `Session - ${new Date().toLocaleDateString()}`;
        } catch {
          title = `Session - ${new Date().toLocaleDateString()}`;
        }
      } else {
        title = `Session - ${new Date().toLocaleDateString()}`;
      }

      // Map HPI format to SOAP fields for storage (HPI combines S+O+A)
      const noteData = soapNote?.hpi ? {
        subjective: soapNote.hpi,
        objective: "",
        assessment: "",
        plan: soapNote?.plan || "",
      } : {
        subjective: soapNote?.subjective || "",
        objective: soapNote?.objective || "",
        assessment: soapNote?.assessment || "",
        plan: soapNote?.plan || "",
      };
      
      const response = await apiRequest("POST", "/api/notes", {
        title,
        patientName,
        specialty: "general",
        ...noteData,
        transcript,
        patientContext: contextText || null,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      clearBackup();
      toast({
        title: "Session saved",
        description: "Your session has been saved successfully",
      });
      navigate(`/notes/${data.id}`);
    },
    onError: () => {
      toast({
        title: "Failed to save",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

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
      // Very short recording that didn't trigger any chunk - transcribe the full blob
      setRecordingState("processing");
      addTranscriptEntry("Processing short recording...");
      transcribeMutation.mutate(audioBlob);
    } else {
      // Process any remaining chunks
      await finalizeRecording();
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
      setRecordingState("processing");
      addTranscriptEntry("Processing uploaded audio...");
      transcribeMutation.mutate(file);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
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
      setPatientName(backup.patientName || "");
      // Add transcript content to entries
      addTranscriptEntry(backup.transcript, "content");
      committedTextRef.current = backup.transcript;
      clearBackup();
      toast({
        title: "Transcript recovered",
        description: "Your previous session has been restored",
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
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
                  variant="destructive"
                  onClick={handleStopAndTranscribe}
                  className="h-8 w-8 p-0"
                  data-testid="button-stop-header"
                >
                  <Square className="h-4 w-4" />
                </Button>
              </div>
            )}
            {recordingState === "processing" && (
              <Button size="sm" disabled className="h-8 w-24 justify-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                Wait...
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
                            <p className="whitespace-pre-wrap text-base leading-relaxed">{entry.text}</p>
                          </div>
                        )}
                      </div>
                    ))}
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
                    
                    {/* Dynamically show sections based on what the AI returned */}
                    {(soapNote.hpi ? [
                      { key: "hpi", label: "HPI" },
                      { key: "plan", label: "Plan" },
                    ] : [
                      { key: "subjective", label: "Subjective" },
                      { key: "objective", label: "Objective" },
                      { key: "assessment", label: "Assessment" },
                      { key: "plan", label: "Plan" },
                    ]).filter(({ key }) => soapNote[key]).map(({ key, label }) => (
                      <div key={key}>
                        <h3 className="font-medium text-sm mb-1">{label}</h3>
                        <MedicalAutocomplete
                          value={soapNote[key] || ''}
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
