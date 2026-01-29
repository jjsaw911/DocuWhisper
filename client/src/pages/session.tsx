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
import {
  Mic,
  Square,
  Pause,
  Play,
  Upload,
  Copy,
  Undo,
  Redo,
  Loader2,
  Calendar,
  Globe,
  Sparkles,
  AudioLines,
  AlertCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Template = {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean | null;
};

type RecordingState = "idle" | "recording" | "paused" | "processing";

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
  const [activeTab, setActiveTab] = useState("transcript");
  const [soapNote, setSoapNote] = useState<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  } | null>(null);

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
    
    console.log(`[Chunk ${chunkItem.id}] Processing ${chunkItem.blob.size} bytes...`);
    
    try {
      const cumulativeTranscript = await transcribeChunk(chunkItem.blob);
      
      if (cumulativeTranscript && cumulativeTranscript.trim()) {
        // Extract only the NEW content (delta) from cumulative transcript
        // Since AI may rephrase slightly, use character-length-based extraction
        const previousLength = lastCumulativeTranscriptRef.current.length;
        const currentTranscript = cumulativeTranscript.trim();
        let deltaText = currentTranscript;
        
        if (previousLength > 0) {
          // Find approximate starting position for new content
          // Look for a sentence boundary near the previous length position
          // Allow for some variance (AI rephrasing may shift things ±20%)
          const searchStart = Math.max(0, Math.floor(previousLength * 0.85));
          const searchEnd = Math.min(currentTranscript.length, Math.ceil(previousLength * 1.15));
          
          // Find the LAST sentence boundary in the search range (to minimize overlap)
          let splitPos = previousLength;
          let lastBoundary = -1;
          
          // Look for sentence endings (. ? !) in the search range - prefer the LAST one
          for (let i = searchStart; i < searchEnd && i < currentTranscript.length; i++) {
            const char = currentTranscript[i];
            if ((char === '.' || char === '?' || char === '!') && i + 1 < currentTranscript.length && currentTranscript[i + 1] === ' ') {
              lastBoundary = i + 2; // After the punctuation and space
            }
          }
          
          if (lastBoundary > 0) {
            splitPos = lastBoundary;
          } else {
            // No sentence boundary found - look for word boundary near end of search range
            const nextSpace = currentTranscript.lastIndexOf(' ', searchEnd);
            if (nextSpace > searchStart) {
              splitPos = nextSpace + 1;
            }
          }
          
          deltaText = currentTranscript.substring(splitPos).trim();
          
          // Check if delta starts with content that duplicates end of committed text
          // This catches cases where the AI slightly re-transcribes the last phrase
          const committedText = committedTextRef.current;
          if (committedText && deltaText) {
            // Look for the first 30-50 chars of delta in the last 100 chars of committed
            const deltaStart = deltaText.substring(0, Math.min(50, deltaText.length)).toLowerCase();
            const committedEnd = committedText.substring(Math.max(0, committedText.length - 150)).toLowerCase();
            
            const dupIndex = committedEnd.indexOf(deltaStart.substring(0, 25));
            if (dupIndex >= 0) {
              // Found a duplicate - try to find where the new content actually starts
              // Look for the next sentence in delta
              const nextSentence = deltaText.search(/[.?!]\s+[A-Z]/);
              if (nextSentence > 0) {
                deltaText = deltaText.substring(nextSentence + 2).trim();
                console.log(`[Delta] Removed duplicate prefix, new delta starts: "${deltaText.substring(0, 40)}..."`);
              }
            }
          }
          
          console.log(`[Delta] Previous ${previousLength} chars, split at ${splitPos}, delta: "${deltaText.substring(0, 50)}..."`);
        }
        
        // Update cumulative tracker
        lastCumulativeTranscriptRef.current = currentTranscript;
        
        if (deltaText) {
          const added = addTranscriptContent(deltaText, chunkItem.timestampSec);
          console.log(`[Chunk ${chunkItem.id}] Delta (${deltaText.length} chars from ${currentTranscript.length} cumulative): ${added ? 'ADDED' : 'DROPPED as duplicate'}`);
          
          // Auto-backup after each chunk - ensures transcript is preserved even if browser crashes
          saveBackup(committedTextRef.current, patientName, "general");
        } else {
          console.log(`[Chunk ${chunkItem.id}] No new content in this chunk (cumulative: ${currentTranscript.length} chars)`);
        }
      } else {
        console.log(`[Chunk ${chunkItem.id}] No transcript returned (empty or null)`);
      }
    } catch (err) {
      console.error(`[Chunk ${chunkItem.id}] Error:`, err);
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
          chunksRef.current.push(e.data);
          
          // Create a COMPLETE blob from all chunks so far (includes header from first chunk)
          const completeBlob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
          
          // Create unique chunk item with the complete audio and timestamp
          const chunkId = nextChunkIdRef.current++;
          const timestampSec = chunkId * chunkIntervalSec; // 0, 40, 80, 120...
          const chunkItem: ChunkItem = { id: chunkId, blob: completeBlob, processed: false, timestampSec };
          pendingChunksRef.current.push(chunkItem);
          console.log(`[Chunk ${chunkId}] Queued at ${formatTime(timestampSec)} (${completeBlob.size} bytes from ${chunksRef.current.length} fragments)`);
          
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
      mediaRecorderRef.current.pause();
      setRecordingState("paused");
      addTranscriptEntry("Transcript paused");
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setAudioLevel([0, 0, 0, 0, 0]);
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
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.requestData();
        }
        
        mediaRecorderRef.current.onstop = () => {
          setTimeout(() => {
            const blob = new Blob(chunksRef.current, { type: "audio/webm" });
            resolve(blob);
          }, 100);
        };
        mediaRecorderRef.current.stop();
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
    addTranscriptEntry("Finalizing transcription...");

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

      // Finalize any pending partial text before generating full transcript
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

      addTranscriptEntry("Generating clinical note...");

      const soapResponse = await apiRequest("POST", "/api/generate-soap", {
        transcript: fullTranscript,
        patientName,
        specialty: "general",
        templateId: selectedTemplateId !== "default" ? parseInt(selectedTemplateId) : undefined,
        outputLanguage: transcriptionLanguage,
      });

      if (!soapResponse.ok) {
        const errorData = await soapResponse.json().catch(() => ({}));
        console.error("SOAP generation failed:", errorData);
        throw new Error(errorData.error || "Failed to generate SOAP note");
      }

      const generatedSoap = await soapResponse.json();
      console.log("Generated SOAP:", generatedSoap);

      if (!generatedSoap.subjective && !generatedSoap.objective && !generatedSoap.assessment && !generatedSoap.plan) {
        console.error("SOAP response has no content:", generatedSoap);
        throw new Error("SOAP generation returned empty content");
      }

      setSoapNote(generatedSoap);

      let noteTitle = patientName
        ? `${patientName} - ${new Date().toLocaleDateString()}`
        : `Session - ${new Date().toLocaleDateString()}`;

      if (!patientName) {
        try {
          const titleResult = await generateTitleMutation.mutateAsync(fullTranscript);
          if (titleResult.title) {
            noteTitle = titleResult.title;
          }
        } catch {
        }
      }

      const saveResponse = await apiRequest("POST", "/api/notes", {
        title: noteTitle,
        patientName: patientName || null,
        specialty: "general",
        subjective: generatedSoap.subjective || "",
        objective: generatedSoap.objective || "",
        assessment: generatedSoap.assessment || "",
        plan: generatedSoap.plan || "",
        transcript: fullTranscript,
      });
      const savedNote = await saveResponse.json();

      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setActiveTab("soap");
      addTranscriptEntry("Note saved automatically");
      
      // Clear backup after successful save
      clearBackup();

      toast({
        title: "Session saved",
        description: "Your note has been generated and saved",
      });

      navigate(`/notes/${savedNote.id}`);

    } catch (error) {
      console.error("Finalization failed:", error);
      toast({
        title: "Save failed",
        description: "Could not generate and save the note. Please try again.",
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
        addTranscriptEntry(data.transcript, "content");
        
        setRecordingState("processing");
        addTranscriptEntry("Generating clinical note...");
        
        try {
          const soapResponse = await apiRequest("POST", "/api/generate-soap", {
            transcript: data.transcript,
            patientName,
            specialty: "general",
            templateId: selectedTemplateId !== "default" ? parseInt(selectedTemplateId) : undefined,
            outputLanguage: transcriptionLanguage,
          });
          
          if (!soapResponse.ok) {
            throw new Error("Failed to generate SOAP note");
          }
          
          const generatedSoap = await soapResponse.json();
          setSoapNote(generatedSoap);
          
          let noteTitle = patientName
            ? `${patientName} - ${new Date().toLocaleDateString()}`
            : `Session - ${new Date().toLocaleDateString()}`;
          
          if (!patientName) {
            try {
              const titleResult = await generateTitleMutation.mutateAsync(data.transcript);
              if (titleResult.title) noteTitle = titleResult.title;
            } catch {}
          }
          
          const saveResponse = await apiRequest("POST", "/api/notes", {
            title: noteTitle,
            patientName: patientName || null,
            specialty: "general",
            subjective: generatedSoap.subjective || "",
            objective: generatedSoap.objective || "",
            assessment: generatedSoap.assessment || "",
            plan: generatedSoap.plan || "",
            transcript: data.transcript,
          });
          const savedNote = await saveResponse.json();
          
          queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
          clearBackup();
          toast({ title: "Session saved", description: "Your note has been generated and saved" });
          navigate(`/notes/${savedNote.id}`);
        } catch (error) {
          console.error("Upload processing failed:", error);
          toast({ title: "Processing failed", description: "Could not generate note from uploaded audio.", variant: "destructive" });
        }
        
        setRecordingState("idle");
      } else {
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

      const response = await apiRequest("POST", "/api/generate-soap", {
        transcript,
        patientName,
        specialty: "general",
        templateId: selectedTemplateId !== "default" ? parseInt(selectedTemplateId) : undefined,
        outputLanguage: transcriptionLanguage,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSoapNote(data);
      setActiveTab("soap");
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

      const response = await apiRequest("POST", "/api/notes", {
        title: patientName ? `${patientName} - ${new Date().toLocaleDateString()}` : `Session - ${new Date().toLocaleDateString()}`,
        patientName,
        specialty: "general",
        subjective: soapNote?.subjective || "",
        objective: soapNote?.objective || "",
        assessment: soapNote?.assessment || "",
        plan: soapNote?.plan || "",
        transcript,
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
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Check if no chunks were queued (short recording) and no transcript yet
    const hasAnyChunks = pendingChunksRef.current.length > 0;
    const hasTranscript = committedTextRef.current.trim().length > 0;
    
    if (!hasAnyChunks && !hasTranscript && audioBlob.size > 0) {
      setRecordingState("processing");
      addTranscriptEntry("Processing short recording...");
      transcribeMutation.mutate(audioBlob);
    } else {
      await finalizeRecording();
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

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>{formatTime(duration)}</span>
            </div>
            
            <div className="flex items-center gap-0.5">
              {audioLevel.map((level, i) => (
                <div
                  key={i}
                  className="w-1 bg-primary rounded-full transition-all duration-75"
                  style={{ height: `${Math.max(4, level * 16)}px` }}
                />
              ))}
            </div>

            <ThemeToggle />
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between">
              <TabsList className="h-8">
                <TabsTrigger value="transcript" className="text-xs px-3" data-testid="tab-transcript">
                  <AudioLines className="h-3 w-3 mr-1" />
                  Transcript
                </TabsTrigger>
                <TabsTrigger value="soap" className="text-xs px-3" data-testid="tab-soap" disabled={!soapNote}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  SOAP Note
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="h-8 w-48" data-testid="select-template">
                    <SelectValue placeholder="Select template" />
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

                <Button variant="outline" size="sm" disabled className="h-8">
                  <Undo className="h-3 w-3 mr-1" />
                </Button>
                <Button variant="outline" size="sm" disabled className="h-8">
                  <Redo className="h-3 w-3 mr-1" />
                </Button>
                <Button variant="outline" size="sm" className="h-8" data-testid="button-copy">
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
            </div>
          </Tabs>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="transcript" className="mt-0">
            {transcriptEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <h2 className="text-xl font-medium mb-2">Start this session using the controls below</h2>
                <p className="text-muted-foreground mb-6">
                  Your transcript will appear here once you start recording
                </p>
              </div>
            ) : (
              <div className="space-y-4 max-w-3xl">
                {transcriptEntries.map((entry, index) => (
                  <div key={index} className={entry.type === "system" ? "text-muted-foreground text-sm" : ""}>
                    {entry.type === "system" ? (
                      <p className="italic">{entry.text} {entry.timestamp}</p>
                    ) : (
                      <div className="bg-muted/50 rounded-lg p-4">
                        <p className="whitespace-pre-wrap text-base leading-relaxed" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>{entry.text}</p>
                      </div>
                    )}
                  </div>
                ))}
                {recordingState === "recording" && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                      Listening...
                    </span>
                  </div>
                )}
                {recordingState === "processing" && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing transcript...
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="soap" className="mt-0">
            {soapNote ? (
              <div className="space-y-6 max-w-3xl">
                {[
                  { key: "subjective", label: "Subjective" },
                  { key: "objective", label: "Objective" },
                  { key: "assessment", label: "Assessment" },
                  { key: "plan", label: "Plan" },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <h3 className="font-medium mb-2">{label}</h3>
                    <Textarea
                      value={soapNote[key as keyof typeof soapNote]}
                      onChange={(e) =>
                        setSoapNote((prev) =>
                          prev ? { ...prev, [key]: e.target.value } : null
                        )
                      }
                      className="min-h-[100px] text-base leading-relaxed"
                      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                      data-testid={`textarea-${key}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                <p className="text-muted-foreground">
                  Generate a SOAP note from your transcript
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t bg-background p-4">
        <div className="flex items-center justify-center gap-3">
          {recordingState === "idle" && (
            <>
              <Button
                size="lg"
                onClick={startRecording}
                className="gap-2"
                data-testid="button-start-recording"
              >
                <Mic className="h-5 w-5" />
                Start transcribing
              </Button>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="audio/*"
                className="hidden"
              />
              <Button
                variant="outline"
                size="lg"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
                data-testid="button-upload-audio"
              >
                <Upload className="h-5 w-5" />
                Upload audio
              </Button>
            </>
          )}

          {recordingState === "recording" && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={pauseRecording}
                className="h-10 w-10"
                data-testid="button-pause"
              >
                <Pause className="h-5 w-5" />
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={handleStopAndTranscribe}
                className="gap-2"
                data-testid="button-stop-recording"
              >
                <span className="h-2 w-2 bg-white rounded-full animate-pulse" />
                Stop transcribing
              </Button>
            </>
          )}

          {recordingState === "paused" && (
            <>
              <Button
                size="lg"
                onClick={resumeRecording}
                className="gap-2"
                data-testid="button-resume"
              >
                <Play className="h-5 w-5" />
                Resume
              </Button>
              <Button
                variant="destructive"
                size="lg"
                onClick={handleStopAndTranscribe}
                className="gap-2"
                data-testid="button-stop-recording"
              >
                <Square className="h-4 w-4" />
                Stop & Create
              </Button>
            </>
          )}

          {recordingState === "processing" && (
            <Button size="lg" disabled className="gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing...
            </Button>
          )}

          {recordingState === "idle" && hasTranscript && (
            <>
              <Button
                variant="default"
                size="lg"
                onClick={() => generateSoapMutation.mutate()}
                disabled={generateSoapMutation.isPending}
                className="gap-2"
                data-testid="button-generate-soap"
              >
                {generateSoapMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
                Generate SOAP
              </Button>
              
              {soapNote && (
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => saveNoteMutation.mutate()}
                  disabled={saveNoteMutation.isPending}
                  className="gap-2"
                  data-testid="button-save-session"
                >
                  {saveNoteMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Save Session"
                  )}
                </Button>
              )}
            </>
          )}
        </div>
        
        <p className="text-xs text-muted-foreground text-center mt-3">
          Review your note before use to ensure it accurately represents the visit
        </p>
      </footer>
    </div>
  );
}
