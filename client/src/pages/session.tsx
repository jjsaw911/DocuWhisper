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
  Settings,
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

  const isNewSession = !params.id || params.id === "new";

  const [patientName, setPatientName] = useState("");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState<number[]>([0, 0, 0, 0, 0]);
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default");
  const [activeTab, setActiveTab] = useState("context");
  const [soapNote, setSoapNote] = useState<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTranscribingRef = useRef<boolean>(false);
  
  // Chunk tracking with unique IDs to prevent duplicate processing
  type ChunkItem = { id: number; blob: Blob; processed: boolean; timestampSec: number };
  const pendingChunksRef = useRef<ChunkItem[]>([]);
  const nextChunkIdRef = useRef<number>(0);
  const processedChunkIdsRef = useRef<Set<number>>(new Set());
  const chunkIntervalSec = 20; // 20-second chunks for faster feedback
  
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
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "chunk.webm");
      formData.append("language", transcriptionLanguage);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        console.error("Chunk transcription failed");
        return null;
      }

      const data = await response.json();
      return data.transcript || null;
    } catch (error) {
      console.error("Chunk transcription error:", error);
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
    if (!chunkItem) {
      console.log("[Chunk] No unprocessed chunks remaining");
      return;
    }
    if (isTranscribingRef.current) {
      console.log("[Chunk] Already transcribing, will be picked up later");
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
    if (analyserRef.current && recordingState === "recording") {
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
      
      animationRef.current = requestAnimationFrame(updateAudioLevel);
    }
  }, [recordingState]);

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

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      pendingChunksRef.current = [];
      nextChunkIdRef.current = 0;
      processedChunkIdsRef.current.clear();
      
      // Reset transcript state
      committedTextRef.current = "";
      partialTextRef.current = "";
      recentLinesRef.current = [];
      lastCumulativeTranscriptRef.current = "";

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          // Store the raw fragment for final blob assembly
          chunksRef.current.push(e.data);
          
          // Create INDEPENDENT chunk blob (just this segment, not cumulative)
          // This prevents memory issues and AI confusion on long recordings
          const independentBlob = new Blob([e.data], { type: mediaRecorder.mimeType });
          
          // Create unique chunk item with just this audio segment
          const chunkId = nextChunkIdRef.current++;
          const timestampSec = chunkId * chunkIntervalSec;
          const chunkItem: ChunkItem = { id: chunkId, blob: independentBlob, processed: false, timestampSec };
          pendingChunksRef.current.push(chunkItem);
          console.log(`[Chunk ${chunkId}] Queued at ${formatTime(timestampSec)} (${independentBlob.size} bytes, independent segment)`);
          
          processNextChunk();
        }
      };

      mediaRecorder.start(20000); // 20-second chunks for faster feedback
      setRecordingState("recording");
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

  const pauseRecording = () => {
    if (mediaRecorderRef.current && recordingState === "recording") {
      const recorder = mediaRecorderRef.current;
      
      // Request any pending audio data before pausing
      // This triggers ondataavailable with current chunk so it gets transcribed
      console.log("[Pause] Requesting data before pause...");
      recorder.requestData();
      
      // Give time for ondataavailable to fire, then pause
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.pause();
        }
        setRecordingState("paused");
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
      }, 100);
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && recordingState === "paused") {
      mediaRecorderRef.current.resume();
      setRecordingState("recording");
      addTranscriptEntry("Transcript resumed");
      
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
      
      animationRef.current = requestAnimationFrame(updateAudioLevel);
    }
  };

  const stopRecording = () => {
    return new Promise<Blob>((resolve) => {
      if (mediaRecorderRef.current) {
        const recorder = mediaRecorderRef.current;
        
        // Set up onstop handler BEFORE calling stop
        recorder.onstop = () => {
          // Give time for final ondataavailable to complete
          setTimeout(() => {
            const blob = new Blob(chunksRef.current, { type: "audio/webm" });
            console.log(`[Stop] Recording stopped. Total chunks: ${chunksRef.current.length}, Blob size: ${blob.size}`);
            resolve(blob);
          }, 200);
        };
        
        // If recording, request final data chunk before stopping
        if (recorder.state === "recording") {
          console.log("[Stop] Requesting final data chunk...");
          // The ondataavailable will fire when stop() is called, capturing remaining audio
          recorder.stop();
        } else if (recorder.state === "paused") {
          // If paused, just stop - no new data to capture
          console.log("[Stop] Stopping from paused state...");
          recorder.stop();
        } else {
          // Already inactive
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          resolve(blob);
        }
      } else {
        resolve(new Blob([], { type: "audio/webm" }));
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
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

      // Just show ready message - don't auto-generate or save
      addTranscriptEntry("Ready. Click Resume to add more audio, or Generate SOAP when done.");
      
      toast({
        title: "Recording complete",
        description: "Click Resume to add more, or Generate SOAP when ready.",
      });

    } catch (error) {
      console.error("Finalization failed:", error);
      toast({
        title: "Processing failed",
        description: "There was an issue processing the recording.",
        variant: "destructive",
      });
    }

    setRecordingState("idle");
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
        // Add transcript content - this makes hasTranscript true
        addTranscriptEntry(data.transcript, "content");
        committedTextRef.current = (committedTextRef.current + " " + data.transcript).trim();
        
        // Just show ready message - don't auto-generate or save
        addTranscriptEntry("Ready. Click Resume to add more audio, or Generate SOAP when done.");
        
        toast({
          title: "Recording complete",
          description: "Click Resume to add more, or Generate SOAP when ready.",
        });
      } else {
        toast({
          title: "No speech detected",
          description: "The recording didn't capture any speech. Please try again.",
          variant: "destructive",
        });
      }
      setRecordingState("idle");
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

      const response = await apiRequest("POST", "/api/generate-soap", {
        transcript,
        patientName,
        specialty: "general",
        templateId: selectedTemplateId !== "default" ? parseInt(selectedTemplateId) : undefined,
        outputLanguage: transcriptionLanguage,
        context: contextText || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
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

      const response = await apiRequest("POST", "/api/notes", {
        title,
        patientName,
        specialty: "general",
        subjective: soapNote?.subjective || "",
        objective: soapNote?.objective || "",
        assessment: soapNote?.assessment || "",
        plan: soapNote?.plan || "",
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
      
      const response = await apiRequest("POST", "/api/ai-assistant", {
        question: aiCommand,
        noteContent: `
Patient: ${patientName || "Not specified"}
Context: ${contextText || "None provided"}
Transcript: ${fullTranscript || "No transcript yet"}
${soapNote ? `
SOAP Note:
Subjective: ${soapNote.subjective}
Objective: ${soapNote.objective}
Assessment: ${soapNote.assessment}
Plan: ${soapNote.plan}
` : ""}
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
            
            {/* Audio level visualization */}
            <div className="flex items-center gap-0.5 h-6">
              {audioLevel.map((level, i) => (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-100 ${
                    recordingState === "recording" 
                      ? level > 0.6 ? "bg-red-500" : level > 0.3 ? "bg-yellow-500" : "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                  style={{ height: `${Math.max(4, level * 24)}px` }}
                />
              ))}
            </div>

            {/* Microphone selection dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-mic-settings">
                  <Settings className="h-4 w-4" />
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
                      text={`${soapNote.subjective} ${soapNote.objective} ${soapNote.assessment} ${soapNote.plan}`} 
                    />
                    
                    {[
                      { key: "subjective", label: "Subjective" },
                      { key: "objective", label: "Objective" },
                      { key: "assessment", label: "Assessment" },
                      { key: "plan", label: "Plan" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <h3 className="font-medium text-sm mb-1">{label}</h3>
                        <MedicalAutocomplete
                          value={soapNote[key as keyof typeof soapNote]}
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
