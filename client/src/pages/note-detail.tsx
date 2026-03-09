import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams, useLocation } from "wouter";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { 
  ArrowLeft, 
  Save,
  Loader2,
  Calendar,
  User,
  FileText,
  Clock,
  AudioLines,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Download,
  Share2,
  Wand2,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronUp,
  Languages,
  FileSignature,
  Code2,
  MessageSquare,
  ClipboardList,
  Send,
  X,
  ListTodo,
  Plus,
  ShoppingCart,
  Users,
  Wifi,
  WifiOff,
  ClipboardCopy,
  Mic,
  Trash2,
  Printer,
  Scissors
} from "lucide-react";
import { DrugInteractionAlert, DrugInteractionDialog } from "@/components/drug-interaction-alert";
import { useCollaboration } from "@/hooks/use-collaboration";
import { useCopiedToEmr } from "@/hooks/use-copied-to-emr";
import { CollaboratorAvatars } from "@/components/collaborator-avatars";
import { MedicalAutocomplete } from "@/components/medical-autocomplete";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Note, Task, Template, Practice, SharedNote, UserSettings } from "@shared/schema";

const TASK_CATEGORIES = [
  { value: "document", label: "Document", icon: FileText },
  { value: "order", label: "Order", icon: ShoppingCart },
  { value: "coordinate", label: "Coordinate", icon: Users },
  { value: "communicate", label: "Communicate", icon: MessageSquare },
];

type SuggestedDiagnosisCode = {
  code: string;
  description: string;
  category: string;
  confidence: string;
};

type SuggestedCptCode = {
  code: string;
  description: string;
  rationale: string;
};

type PriorAuthDiagnosisSuggestion = {
  code: string;
  description: string;
  medication: string;
  rationale: string;
  confidence: string;
};

type SuggestedCodesPayload = {
  codes: SuggestedDiagnosisCode[];
  cptCodes: SuggestedCptCode[];
  priorAuthDxCodes?: PriorAuthDiagnosisSuggestion[];
  visitTimeMinutes?: number;
};

const CPT_TIME_MIDPOINT_MINUTES: Record<string, number> = {
  "99211": 5,
  "99212": 15,
  "99213": 25,
  "99214": 35,
  "99215": 47,
  "99202": 22,
  "99203": 37,
  "99204": 52,
  "99205": 67,
  "99441": 8,
  "99442": 18,
  "99443": 28,
};

const parsePositiveMinutes = (value: unknown): number | undefined => {
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

const toDateTimeInputValue = (value: unknown): string => {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
};

const resolveNoteDate = (editableDateTime: string, fallbackValue: unknown): Date => {
  if (editableDateTime) {
    const edited = new Date(editableDateTime);
    if (!Number.isNaN(edited.getTime())) return edited;
  }

  if (fallbackValue) {
    const fallback = new Date(fallbackValue as string | number | Date);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }

  return new Date();
};

const estimateMinutesFromCptCodes = (cptCodes: SuggestedCptCode[]): number | undefined => {
  for (const cpt of cptCodes) {
    const normalizedCode = cpt.code.trim();
    if (CPT_TIME_MIDPOINT_MINUTES[normalizedCode]) {
      return CPT_TIME_MIDPOINT_MINUTES[normalizedCode];
    }
  }
  return undefined;
};

const normalizeSuggestedCodes = (value: unknown): SuggestedCodesPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const rawCodes = Array.isArray(source.codes) ? source.codes : [];
  const rawCptCodes = Array.isArray(source.cptCodes) ? source.cptCodes : [];

  const codes: SuggestedDiagnosisCode[] = rawCodes
    .filter((code) => code && typeof code === "object")
    .map((code) => {
      const entry = code as Record<string, unknown>;
      return {
        code: typeof entry.code === "string" ? entry.code : "",
        description: typeof entry.description === "string" ? entry.description : "",
        category: typeof entry.category === "string" ? entry.category : "secondary",
        confidence: typeof entry.confidence === "string" ? entry.confidence : "medium",
      };
    })
    .filter((code) => code.code.trim().length > 0);

  const cptCodes: SuggestedCptCode[] = rawCptCodes
    .filter((code) => code && typeof code === "object")
    .map((code) => {
      const entry = code as Record<string, unknown>;
      return {
        code: typeof entry.code === "string" ? entry.code : "",
        description: typeof entry.description === "string" ? entry.description : "",
        rationale: typeof entry.rationale === "string" ? entry.rationale : "",
      };
    })
    .filter((code) => code.code.trim().length > 0);

  const rawPriorAuthCodes = Array.isArray(source.priorAuthDxCodes)
    ? source.priorAuthDxCodes
    : Array.isArray(source.paDiagnosisCodes)
      ? source.paDiagnosisCodes
      : [];

  const priorAuthDxCodes: PriorAuthDiagnosisSuggestion[] = rawPriorAuthCodes
    .filter((code) => code && typeof code === "object")
    .map((code) => {
      const entry = code as Record<string, unknown>;
      return {
        code: typeof entry.code === "string" ? entry.code : "",
        description: typeof entry.description === "string" ? entry.description : "",
        medication: typeof entry.medication === "string" ? entry.medication : "",
        rationale: typeof entry.rationale === "string" ? entry.rationale : "",
        confidence: typeof entry.confidence === "string" ? entry.confidence : "medium",
      };
    })
    .filter((code) => code.code.trim().length > 0);

  const explicitMinutes =
    parsePositiveMinutes(source.visitTimeMinutes) ??
    parsePositiveMinutes(source.timeSpentMinutes) ??
    parsePositiveMinutes(source.billableTimeMinutes) ??
    parsePositiveMinutes(source.estimatedTimeMinutes);

  const inferredMinutes = explicitMinutes ?? estimateMinutesFromCptCodes(cptCodes);

  const normalized: SuggestedCodesPayload = {
    codes,
    cptCodes,
    ...(priorAuthDxCodes.length > 0 ? { priorAuthDxCodes } : {}),
  };

  if (inferredMinutes) {
    normalized.visitTimeMinutes = inferredMinutes;
  }

  return normalized;
};

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: note, isLoading } = useQuery<Note>({
    queryKey: ["/api/notes", id],
    enabled: !!user && !!id,
  });

  // Handle remote updates from collaborators
  const handleRemoteUpdate = useCallback((field: string, value: string) => {
    if (field === "soapNote") {
      setFormData(prev => ({ ...prev, soapNote: value }));
    }
  }, []);

  // Format initial SOAP content for collaboration seeding
  const initialSoapContent = useMemo(() => {
    if (!note) return "";
    const parts = [];
    
    // Detect HPI format: subjective has content but objective/assessment are empty
    const isHpiFormat = note.subjective && !note.objective && !note.assessment;
    
    if (isHpiFormat) {
      parts.push(`HPI:\n${note.subjective}`);
      if (note.plan) parts.push(`PLAN:\n${note.plan}`);
    } else {
      if (note.subjective) parts.push(`SUBJECTIVE:\n${note.subjective}`);
      if (note.objective) parts.push(`OBJECTIVE:\n${note.objective}`);
      if (note.assessment) parts.push(`ASSESSMENT:\n${note.assessment}`);
      if (note.plan) parts.push(`PLAN:\n${note.plan}`);
    }
    return parts.join("\n\n");
  }, [note]);

  // Real-time collaboration hook
  const noteId = id ? parseInt(id) : 0;
  const { isNoteCopiedToEmr, setNoteCopiedToEmr } = useCopiedToEmr(user?.id);
  const isCopiedToEmr = noteId > 0 ? isNoteCopiedToEmr(noteId) : false;
  const { isConnected, collaborators, sendUpdate } = useCollaboration({
    noteId,
    userId: user?.id || "",
    userName: user?.firstName || user?.email || "Anonymous",
    onRemoteUpdate: handleRemoteUpdate,
    initialContent: initialSoapContent, // Seed room with existing note content
    enabled: !!user && noteId > 0 && !!note,
  });

  const [formData, setFormData] = useState({
    title: "",
    patientName: "",
    soapNote: "",
    noteDateTime: "",
  });
  const lastHydratedFormRef = useRef({
    title: "",
    patientName: "",
    soapNote: "",
    noteDateTime: "",
  });
  const [aiInstructions, setAiInstructions] = useState("");
  const [showAiInstructions, setShowAiInstructions] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState("soap");
  const [isEditingNoteDateTime, setIsEditingNoteDateTime] = useState(false);
  const [copied, setCopied] = useState(false);
  const [translateLanguage, setTranslateLanguage] = useState("es");
  const [transcriptSelection, setTranscriptSelection] = useState<{ start: number; end: number; text: string }>({
    start: 0,
    end: 0,
    text: "",
  });
  const [showSplitTranscriptDialog, setShowSplitTranscriptDialog] = useState(false);
  const [splitNoteTitle, setSplitNoteTitle] = useState("");
  const [splitPatientName, setSplitPatientName] = useState("");
  
  // Undo/redo history for SOAP note
  const [soapHistory, setSoapHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Push current state to history before a change
  const pushToHistory = (currentValue: string) => {
    // Only push if different from the last history entry
    if (soapHistory[historyIndex] !== currentValue) {
      const newHistory = soapHistory.slice(0, historyIndex + 1);
      newHistory.push(currentValue);
      // Keep max 20 history entries
      if (newHistory.length > 20) newHistory.shift();
      setSoapHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  };
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < soapHistory.length - 1;
  
  const handleUndo = () => {
    if (canUndo) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setFormData(prev => ({ ...prev, soapNote: soapHistory[newIndex] }));
    }
  };
  
  const handleRedo = () => {
    if (canRedo) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setFormData(prev => ({ ...prev, soapNote: soapHistory[newIndex] }));
    }
  };
  
  // New feature states
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralSpecialty, setReferralSpecialty] = useState("");
  const [referralReason, setReferralReason] = useState("");
  const [referralLetter, setReferralLetter] = useState("");
  
  const [suggestedCodes, setSuggestedCodes] = useState<SuggestedCodesPayload | null>(null);
  const [billableTimeInput, setBillableTimeInput] = useState("");
  
  // Ref to hold latest suggestedCodes for mutation closure
  const suggestedCodesRef = useRef(suggestedCodes);
  suggestedCodesRef.current = suggestedCodes;

  useEffect(() => {
    const minutes = parsePositiveMinutes(suggestedCodes?.visitTimeMinutes);
    setBillableTimeInput(minutes ? String(minutes) : "");
  }, [suggestedCodes?.visitTimeMinutes]);

  const cumulativeVisitMinutes = useMemo(
    () => parsePositiveMinutes(suggestedCodes?.visitTimeMinutes),
    [suggestedCodes?.visitTimeMinutes],
  );

  const effectiveNoteDate = useMemo(
    () => resolveNoteDate(formData.noteDateTime, note?.createdAt),
    [formData.noteDateTime, note?.createdAt],
  );
  
  const [showAiChat, setShowAiChat] = useState(false);
  
  // Team sharing state
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [selectedPracticeId, setSelectedPracticeId] = useState<string>("");
  
  // Practices query for sharing
  const { data: practices = [] } = useQuery<{ practice: Practice; role: string }[]>({
    queryKey: ["/api/practices"],
    enabled: !!user,
  });
  
  // EMR access query
  const { data: emrAccess } = useQuery<{ hasAccess: boolean }>({
    queryKey: ["/api/emr/access"],
    enabled: !!user,
  });
  const hasEmrAccess = emrAccess?.hasAccess === true;
  
  // Copy to EMR state
  const [showCopyToEmrDialog, setShowCopyToEmrDialog] = useState(false);
  const [selectedEmrPatientId, setSelectedEmrPatientId] = useState<string>("");
  
  // EMR patients query for Copy to EMR feature
  const { data: emrPatients = [] } = useQuery<any[]>({
    queryKey: ["/api/emr/patients"],
    enabled: !!user && hasEmrAccess && showCopyToEmrDialog,
  });
  
  // Note shares query
  const { data: noteShares = [] } = useQuery<SharedNote[]>({
    queryKey: ["/api/notes", id, "shares"],
    enabled: !!user && !!id && showShareDialog,
  });
  
  // Share with practice mutation
  const shareWithPracticeMutation = useMutation({
    mutationFn: async (practiceId: number) => {
      const response = await apiRequest("POST", `/api/notes/${id}/share`, {
        sharedWithPracticeId: practiceId,
        permission: "view",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", id, "shares"] });
      toast({
        title: "Note shared",
        description: "Your note has been shared with the practice",
      });
      setSelectedPracticeId("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to share note",
        variant: "destructive",
      });
    },
  });
  
  // Unshare mutation
  const unshareMutation = useMutation({
    mutationFn: async (shareId: number) => {
      await apiRequest("DELETE", `/api/notes/shares/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", id, "shares"] });
      toast({
        title: "Share removed",
        description: "The note is no longer shared",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove share",
        variant: "destructive",
      });
    },
  });
  
  // Copy to EMR mutation - links note to EMR patient
  const copyToEmrMutation = useMutation({
    mutationFn: async (patientId: number) => {
      const response = await apiRequest("PATCH", `/api/notes/${id}`, {
        patientId: patientId,
      });
      return response.json();
    },
    onSuccess: (_, patientId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", id] });
      toast({
        title: "Linked to EMR",
        description: "Navigating to patient record...",
      });
      setShowCopyToEmrDialog(false);
      setSelectedEmrPatientId("");
      navigate(`/emr/patients/${patientId}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to link note to EMR",
        variant: "destructive",
      });
    },
  });
  
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const [summaryType, setSummaryType] = useState("brief");
  const [generatedSummary, setGeneratedSummary] = useState("");
  const [summaryCache, setSummaryCache] = useState<Record<string, string>>({});

  useEffect(() => {
    if (note?.patientInstructions) {
      setSummaryCache(prev => ({
        ...prev,
        patient_instructions: note.patientInstructions || "",
      }));
    }
  }, [note]);

  useEffect(() => {
    const cached = summaryCache[summaryType];
    if (cached) {
      setGeneratedSummary(cached);
    } else {
      setGeneratedSummary("");
    }
  }, [summaryCache, summaryType]);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState("document");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  
  // Suggested tasks from AI
  const [suggestedTasks, setSuggestedTasks] = useState<Array<{
    title: string;
    category: string;
    priority: string;
    reason: string;
    confirmed?: boolean;
  }>>([]);
  const [isLoadingSuggestedTasks, setIsLoadingSuggestedTasks] = useState(false);
  
  // Suggested referrals from AI
  const [suggestedReferrals, setSuggestedReferrals] = useState<Array<{
    specialty: string;
    reason: string;
    urgency: string;
    confirmed?: boolean;
    letterGenerated?: string;
  }>>([]);
  const [isLoadingReferrals, setIsLoadingReferrals] = useState(false);
  
  // Additional manual diagnoses
  const [additionalDiagnoses, setAdditionalDiagnoses] = useState<Array<{
    code: string;
    description: string;
  }>>([]);
  const [newDiagnosisCode, setNewDiagnosisCode] = useState("");
  const [newDiagnosisDesc, setNewDiagnosisDesc] = useState("");

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
    enabled: !!user,
  });

  const { data: userSettings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    enabled: !!user,
  });

  const { data: noteTasks } = useQuery<Task[]>({
    queryKey: ["/api/notes", id, "tasks"],
    enabled: !!user && !!id,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: { title: string; category: string; noteId: number; patientName?: string; dueDate?: string }) => {
      return apiRequest("POST", "/api/tasks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", id, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      // Keep panel open - only clear the form inputs
      setNewTaskTitle("");
      setNewTaskCategory("document");
      setNewTaskDueDate("");
      toast({
        title: "Task created",
        description: "Task has been linked to this note",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create task",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleCreateTask = () => {
    if (!newTaskTitle.trim() || !id) return;
    createTaskMutation.mutate({
      title: newTaskTitle.trim(),
      category: newTaskCategory,
      noteId: parseInt(id),
      patientName: formData.patientName || undefined,
      dueDate: newTaskDueDate || undefined,
    });
  };

  // Fetch AI-suggested tasks when opening task panel
  const fetchSuggestedTasks = async () => {
    if (!note) return;
    setIsLoadingSuggestedTasks(true);
    try {
      const response = await apiRequest("POST", "/api/suggest-tasks", {
        subjective: note.subjective,
        objective: note.objective,
        assessment: note.assessment,
        plan: note.plan,
      });
      const data = await response.json();
      setSuggestedTasks(data.tasks || []);
    } catch (error) {
      console.error("Failed to fetch suggested tasks:", error);
    } finally {
      setIsLoadingSuggestedTasks(false);
    }
  };

  // Fetch AI-suggested referrals when opening referral panel
  const fetchSuggestedReferrals = async () => {
    if (!note) return;
    setIsLoadingReferrals(true);
    try {
      const response = await apiRequest("POST", "/api/suggest-referrals", {
        subjective: note.subjective,
        objective: note.objective,
        assessment: note.assessment,
        plan: note.plan,
      });
      const data = await response.json();
      setSuggestedReferrals(data.referrals || []);
    } catch (error) {
      console.error("Failed to fetch suggested referrals:", error);
    } finally {
      setIsLoadingReferrals(false);
    }
  };

  // Handle opening task modal - fetch suggestions
  const handleOpenTaskModal = () => {
    setShowTaskModal(true);
    if (suggestedTasks.length === 0) {
      fetchSuggestedTasks();
    }
  };

  // Handle opening referral modal - fetch suggestions
  const handleOpenReferralModal = () => {
    setShowReferralModal(true);
    if (suggestedReferrals.length === 0) {
      fetchSuggestedReferrals();
    }
  };

  // Confirm a suggested task (create it)
  const confirmSuggestedTask = (task: typeof suggestedTasks[0], index: number) => {
    if (!id) return;
    createTaskMutation.mutate({
      title: task.title,
      category: task.category,
      noteId: parseInt(id),
      patientName: formData.patientName || undefined,
    });
    // Mark as confirmed
    setSuggestedTasks(prev => prev.map((t, i) => i === index ? { ...t, confirmed: true } : t));
  };

  // Remove a suggested task from list
  const removeSuggestedTask = (index: number) => {
    setSuggestedTasks(prev => prev.filter((_, i) => i !== index));
  };

  // Confirm a suggested referral (generate letter)
  const confirmSuggestedReferral = async (referral: typeof suggestedReferrals[0], index: number) => {
    try {
      // Pass values directly to avoid stale state issues
      const sections = parseSoapFromText(formData.soapNote);
      const response = await apiRequest("POST", "/api/generate-referral", {
        patientName: formData.patientName,
        subjective: sections.subjective || "",
        objective: sections.objective || "",
        assessment: sections.assessment || "",
        plan: sections.plan || "",
        referToSpecialty: referral.specialty,
        referralReason: referral.reason,
      });
      const data = await response.json();
      
      // Store letter on the suggestion and mark confirmed
      setSuggestedReferrals(prev => prev.map((r, i) => 
        i === index ? { ...r, confirmed: true, letterGenerated: data.referralLetter } : r
      ));
      
      // Also set the main referral letter for display
      setReferralLetter(data.referralLetter);
      
      toast({
        title: "Referral letter generated",
        description: `Referral to ${referral.specialty} created`,
      });
    } catch (error) {
      toast({
        title: "Failed to generate referral",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  // Remove a suggested referral from list
  const removeSuggestedReferral = (index: number) => {
    setSuggestedReferrals(prev => prev.filter((_, i) => i !== index));
  };

  // Add manual diagnosis
  const addManualDiagnosis = () => {
    if (!newDiagnosisCode.trim()) return;
    setAdditionalDiagnoses(prev => [...prev, {
      code: newDiagnosisCode.trim(),
      description: newDiagnosisDesc.trim() || "Custom diagnosis",
    }]);
    setNewDiagnosisCode("");
    setNewDiagnosisDesc("");
  };

  // Remove manual diagnosis
  const removeManualDiagnosis = (index: number) => {
    setAdditionalDiagnoses(prev => prev.filter((_, i) => i !== index));
  };

  const formatSoapNote = (note: Note) => {
    const parts = [];
    
    // Detect HPI format: subjective has content but objective/assessment are empty
    const isHpiFormat = note.subjective && !note.objective && !note.assessment;
    
    if (isHpiFormat) {
      // Display as HPI format
      parts.push(`HPI:\n${note.subjective}`);
      if (note.plan) parts.push(`PLAN:\n${note.plan}`);
    } else {
      // Standard SOAP format
      if (note.subjective) parts.push(`SUBJECTIVE:\n${note.subjective}`);
      if (note.objective) parts.push(`OBJECTIVE:\n${note.objective}`);
      if (note.assessment) parts.push(`ASSESSMENT:\n${note.assessment}`);
      if (note.plan) parts.push(`PLAN:\n${note.plan}`);
    }
    return parts.join("\n\n");
  };

  const parseSoapNote = (text: string) => {
    const sections: { subjective: string; objective: string; assessment: string; plan: string } = {
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
    };

    // Check for HPI format first (HPI + Plan)
    const hpiMatch = text.match(/HPI:\s*([\s\S]*?)(?=PLAN:|$)/i);
    if (hpiMatch) {
      // HPI format: store HPI in subjective field, leave objective/assessment empty
      sections.subjective = hpiMatch[1].trim();
      const planMatch = text.match(/PLAN:\s*([\s\S]*?)$/i);
      if (planMatch) sections.plan = planMatch[1].trim();
      console.log("[parseSoapNote] HPI format detected, subjective length:", sections.subjective.length);
      return sections;
    }

    // Standard SOAP format
    const subjectiveMatch = text.match(/SUBJECTIVE:\s*([\s\S]*?)(?=OBJECTIVE:|ASSESSMENT:|PLAN:|$)/i);
    const objectiveMatch = text.match(/OBJECTIVE:\s*([\s\S]*?)(?=SUBJECTIVE:|ASSESSMENT:|PLAN:|$)/i);
    const assessmentMatch = text.match(/ASSESSMENT:\s*([\s\S]*?)(?=SUBJECTIVE:|OBJECTIVE:|PLAN:|$)/i);
    const planMatch = text.match(/PLAN:\s*([\s\S]*?)(?=SUBJECTIVE:|OBJECTIVE:|ASSESSMENT:|$)/i);

    if (subjectiveMatch) sections.subjective = subjectiveMatch[1].trim();
    if (objectiveMatch) sections.objective = objectiveMatch[1].trim();
    if (assessmentMatch) sections.assessment = assessmentMatch[1].trim();
    if (planMatch) sections.plan = planMatch[1].trim();

    return sections;
  };

  // Reset form data when navigating to a different note (id changes)
  useEffect(() => {
    // Reset form to prevent showing stale data from previous note
    setFormData({
      title: "",
      patientName: "",
      soapNote: "",
      noteDateTime: "",
    });
    lastHydratedFormRef.current = {
      title: "",
      patientName: "",
      soapNote: "",
      noteDateTime: "",
    };
    setSoapHistory([]);
    setHistoryIndex(-1);
    setSelectedTemplateId("");
    setSuggestedCodes(null);
    setBillableTimeInput("");
    setTranscriptSelection({ start: 0, end: 0, text: "" });
    setShowSplitTranscriptDialog(false);
  }, [id]);
  
  // Track whether we've done initial load for this note ID
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  
  useEffect(() => {
    // Reset initial load flag when note ID changes
    setInitialLoadDone(false);
  }, [id]);
  
  useEffect(() => {
    if (!note || note.id !== parseInt(id || "0")) return;

    const incomingSoap = formatSoapNote(note);
    const incomingForm = {
      title: note.title || "",
      patientName: note.patientName || "",
      soapNote: incomingSoap,
      noteDateTime: toDateTimeInputValue(note.createdAt),
    };
    const previousHydrated = lastHydratedFormRef.current;

    const formMatchesPreviousHydrated =
      formData.title === previousHydrated.title &&
      formData.patientName === previousHydrated.patientName &&
      formData.soapNote === previousHydrated.soapNote &&
      formData.noteDateTime === previousHydrated.noteDateTime;

    const incomingMatchesCurrentForm =
      formData.title === incomingForm.title &&
      formData.patientName === incomingForm.patientName &&
      formData.soapNote === incomingForm.soapNote &&
      formData.noteDateTime === incomingForm.noteDateTime;

    const shouldHydrate =
      !initialLoadDone || formMatchesPreviousHydrated || incomingMatchesCurrentForm;

    if (!shouldHydrate) return;

    setFormData(incomingForm);
    lastHydratedFormRef.current = incomingForm;

    // Reset history when server content updates and local form isn't dirty.
    setSoapHistory([incomingSoap]);
    setHistoryIndex(0);

    // Load the saved template selection
    setSelectedTemplateId(note.templateId ? note.templateId.toString() : "");

    // Load saved ICD codes if available
    if (note.icdCodes) {
      try {
        const parsedCodes = typeof note.icdCodes === "string" ? JSON.parse(note.icdCodes) : note.icdCodes;
        setSuggestedCodes(normalizeSuggestedCodes(parsedCodes));
      } catch (e) {
        console.error("Failed to parse saved ICD codes:", e);
        setSuggestedCodes(null);
      }
    } else {
      setSuggestedCodes(null);
    }

    setInitialLoadDone(true);
  }, [note, id, initialLoadDone, formData.title, formData.patientName, formData.soapNote, formData.noteDateTime]);

  const getCreatedAtIsoFromForm = () => {
    if (!formData.noteDateTime) return undefined;
    const parsed = new Date(formData.noteDateTime);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed.toISOString();
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const parsedSoap = parseSoapNote(formData.soapNote);
      // Use ref to get latest suggestedCodes value (avoid stale closure)
      const currentCodes = suggestedCodesRef.current;
      const response = await apiRequest("PATCH", `/api/notes/${id}`, {
        title: formData.title,
        patientName: formData.patientName,
        createdAt: getCreatedAtIsoFromForm(),
        ...parsedSoap,
        icdCodes: currentCodes ? JSON.stringify(currentCodes) : null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({
        title: "Note updated",
        description: "Your changes have been saved",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update note",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const saveBillableTimeMutation = useMutation({
    mutationFn: async (nextCodes: SuggestedCodesPayload) => {
      if (!id) return null;
      const response = await apiRequest("PATCH", `/api/notes/${id}`, {
        icdCodes: JSON.stringify(nextCodes),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({
        title: "Time saved",
        description: "Billable time has been recorded for this note.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to save time",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const saveBillableTime = () => {
    if (!suggestedCodes) return;

    const rawValue = billableTimeInput.trim();
    let nextCodes: SuggestedCodesPayload;
    const currentMinutes = parsePositiveMinutes(suggestedCodes.visitTimeMinutes);

    if (!rawValue) {
      if (!currentMinutes) return;
      const rest = { ...suggestedCodes };
      delete rest.visitTimeMinutes;
      nextCodes = rest;
    } else {
      const parsed = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast({
          title: "Invalid time",
          description: "Enter a whole number of minutes greater than 0.",
          variant: "destructive",
        });
        return;
      }

      const normalizedMinutes = Math.min(240, Math.max(1, Math.round(parsed)));
      if (currentMinutes === normalizedMinutes) return;
      nextCodes = { ...suggestedCodes, visitTimeMinutes: normalizedMinutes };
      setBillableTimeInput(String(normalizedMinutes));
    }

    setSuggestedCodes(nextCodes);
    if (id) {
      saveBillableTimeMutation.mutate(nextCodes);
    }
  };

  const hasTranscriptSelection =
    transcriptSelection.end > transcriptSelection.start && transcriptSelection.text.trim().length > 0;

  const handleTranscriptSelectionChange = (event: any) => {
    const target = event.currentTarget;
    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const text = start !== end ? target.value.slice(start, end) : "";
    setTranscriptSelection({ start, end, text });
  };

  const openSplitTranscriptDialog = () => {
    if (!note?.transcript || !hasTranscriptSelection) {
      toast({
        title: "Select transcript text first",
        description: "Highlight the section you want to move to a new note.",
        variant: "destructive",
      });
      return;
    }

    const baseTitle = formData.title || note.title || "Untitled note";
    setSplitNoteTitle(`${baseTitle} (Split)`);
    setSplitPatientName(formData.patientName || note.patientName || "");
    setShowSplitTranscriptDialog(true);
  };

  const splitTranscriptMutation = useMutation({
    mutationFn: async () => {
      if (!note?.transcript || !id) {
        throw new Error("Transcript is not available");
      }

      const { start, end } = transcriptSelection;
      if (end <= start) {
        throw new Error("Please select transcript text to split");
      }

      const selectedRaw = note.transcript.slice(start, end);
      const selectedTranscript = selectedRaw.trim();
      if (!selectedTranscript) {
        throw new Error("Selected text is empty");
      }

      const remainingTranscript = `${note.transcript.slice(0, start)}${note.transcript.slice(end)}`
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const fallbackTitle = formData.title || note.title || "Split note";
      const nextTitle = splitNoteTitle.trim() || `${fallbackTitle} (Split)`;
      const nextPatientName = splitPatientName.trim() || formData.patientName || note.patientName || "";

      const createPayload: Record<string, any> = {
        title: nextTitle,
        transcript: selectedTranscript,
      };
      if (nextPatientName) createPayload.patientName = nextPatientName;
      if (note.specialty) createPayload.specialty = note.specialty;
      if (note.templateId) createPayload.templateId = note.templateId;

      const createResponse = await apiRequest("POST", "/api/notes", createPayload);
      const createdNote = await createResponse.json();

      await apiRequest("PATCH", `/api/notes/${id}`, {
        transcript: remainingTranscript,
      });

      return createdNote as Note;
    },
    onSuccess: (createdNote) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes", id] });
      if (createdNote?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/notes", String(createdNote.id)] });
      }
      setShowSplitTranscriptDialog(false);
      setTranscriptSelection({ start: 0, end: 0, text: "" });
      toast({
        title: "Transcript split",
        description: `Created "${createdNote.title}" and removed the selected text from this note.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to split transcript",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/notes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({
        title: "Note deleted",
        description: "The note has been permanently removed",
      });
      navigate("/session");
    },
    onError: () => {
      toast({
        title: "Failed to delete note",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      // Save current state to history before regenerating
      pushToHistory(formData.soapNote);
      
      // Handle template selection:
      // - "none" = explicitly no template (standard SOAP)
      // - "" (empty/default) = let backend use user's default template
      // - numeric string = use that specific template
      let effectiveTemplateId: number | undefined = undefined;
      if (selectedTemplateId === "none") {
        // User explicitly chose no template - pass special marker to backend
        effectiveTemplateId = undefined;
      } else if (selectedTemplateId && selectedTemplateId !== "") {
        effectiveTemplateId = parseInt(selectedTemplateId);
      }
      // When selectedTemplateId is "" (default), we pass undefined and let backend determine default
      
      const response = await apiRequest("POST", "/api/generate-soap", {
        transcript: note?.transcript || "",
        patientName: formData.patientName,
        specialty: note?.specialty || "general",
        aiInstructions: aiInstructions,
        templateId: effectiveTemplateId,
        noDefaultTemplate: selectedTemplateId === "none", // Signal to skip default template lookup
      });
      return response.json();
    },
    onSuccess: async (data) => {
      console.log("[Regenerate] AI response keys:", Object.keys(data));
      console.log("[Regenerate] Has HPI:", !!data.hpi, "Has Plan:", !!data.plan);
      
      const newSoapNote: string[] = [];
      
      // Handle HPI format (template returns hpi + plan instead of SOAP)
      if (data.hpi) {
        newSoapNote.push(`HPI:\n${data.hpi}`);
        if (data.plan) newSoapNote.push(`PLAN:\n${data.plan}`);
      } else {
        // Standard SOAP format
        if (data.subjective) newSoapNote.push(`SUBJECTIVE:\n${data.subjective}`);
        if (data.objective) newSoapNote.push(`OBJECTIVE:\n${data.objective}`);
        if (data.assessment) newSoapNote.push(`ASSESSMENT:\n${data.assessment}`);
        if (data.plan) newSoapNote.push(`PLAN:\n${data.plan}`);
      }
      
      const newSoapText = newSoapNote.join("\n\n");
      
      // Update form data
      setFormData(prev => ({
        ...prev,
        soapNote: newSoapText,
      }));
      
      // Push new state to history
      pushToHistory(newSoapText);
      
      setShowAiInstructions(false);
      
      // Auto-save the regenerated note and generate ICD codes
      try {
        // Parse the new SOAP text to save to database
        const noteData = data.hpi ? {
          subjective: data.hpi,
          objective: "",
          assessment: "",
          plan: data.plan || "",
        } : {
          subjective: data.subjective || "",
          objective: data.objective || "",
          assessment: data.assessment || "",
          plan: data.plan || "",
        };
        
        // Generate ICD codes for the new SOAP note
        let icdCodesData = null;
        try {
          const codesResponse = await apiRequest("POST", "/api/suggest-codes", noteData);
          const rawCodesData = await codesResponse.json();
          icdCodesData = normalizeSuggestedCodes(rawCodesData);
          setSuggestedCodes(icdCodesData);
          setActiveMainTab("soap");
        } catch (e) {
          console.error("Failed to generate ICD codes:", e);
        }
        
        // Determine template ID for saving:
        // - "none" = explicitly null (no template used)
        // - numeric string = use that template
        // - "" = no specific selection (can be null)
        let effectiveTemplateId: number | null = null;
        if (selectedTemplateId === "none") {
          effectiveTemplateId = null;
        } else if (selectedTemplateId && selectedTemplateId !== "") {
          effectiveTemplateId = parseInt(selectedTemplateId);
        }
        
        await apiRequest("PATCH", `/api/notes/${id}`, {
          title: formData.title,
          patientName: formData.patientName,
          createdAt: getCreatedAtIsoFromForm(),
          templateId: effectiveTemplateId,
          ...noteData,
          icdCodes: icdCodesData ? JSON.stringify(icdCodesData) : null,
        });
        
        queryClient.invalidateQueries({ queryKey: ["/api/notes", id] });
        queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
        
        const codesMsg = icdCodesData ? ` with ${icdCodesData.codes?.length || 0} ICD codes` : "";
        toast({
          title: "Note regenerated & saved",
          description: `Your changes have been saved automatically${codesMsg}`,
        });
      } catch (error) {
        console.error("Auto-save failed:", error);
        toast({
          title: "Note regenerated",
          description: "Note was regenerated but auto-save failed. Please save manually.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Failed to regenerate",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // Parse SOAP note text back to individual sections
  const parseSoapFromText = (text: string) => {
    const sections: { subjective?: string; objective?: string; assessment?: string; plan?: string } = {};
    const sectionPatterns = [
      { key: 'subjective', pattern: /SUBJECTIVE:\s*([\s\S]*?)(?=OBJECTIVE:|ASSESSMENT:|PLAN:|$)/i },
      { key: 'objective', pattern: /OBJECTIVE:\s*([\s\S]*?)(?=ASSESSMENT:|PLAN:|$)/i },
      { key: 'assessment', pattern: /ASSESSMENT:\s*([\s\S]*?)(?=PLAN:|$)/i },
      { key: 'plan', pattern: /PLAN:\s*([\s\S]*?)$/i },
    ];
    for (const { key, pattern } of sectionPatterns) {
      const match = text.match(pattern);
      if (match) {
        sections[key as keyof typeof sections] = match[1].trim();
      }
    }
    return sections;
  };

  const translateMutation = useMutation({
    mutationFn: async (targetLanguage: string) => {
      const sections = parseSoapFromText(formData.soapNote);
      const response = await apiRequest("POST", "/api/translate-note", {
        subjective: sections.subjective || "",
        objective: sections.objective || "",
        assessment: sections.assessment || "",
        plan: sections.plan || "",
        targetLanguage,
      });
      return response.json();
    },
    onSuccess: (data) => {
      const newSoapNote: string[] = [];
      if (data.subjective) newSoapNote.push(`SUBJECTIVE:\n${data.subjective}`);
      if (data.objective) newSoapNote.push(`OBJECTIVE:\n${data.objective}`);
      if (data.assessment) newSoapNote.push(`ASSESSMENT:\n${data.assessment}`);
      if (data.plan) newSoapNote.push(`PLAN:\n${data.plan}`);
      
      setFormData(prev => ({
        ...prev,
        soapNote: newSoapNote.join("\n\n"),
      }));
      toast({
        title: "Note translated",
        description: `The note has been translated to ${translateLanguage === 'es' ? 'Spanish' : translateLanguage === 'fr' ? 'French' : translateLanguage === 'de' ? 'German' : translateLanguage === 'pt' ? 'Portuguese' : 'the selected language'}`,
      });
    },
    onError: () => {
      toast({
        title: "Translation failed",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // Generate referral letter mutation
  const referralMutation = useMutation({
    mutationFn: async (params?: { specialty?: string; reason?: string }) => {
      const sections = parseSoapFromText(formData.soapNote);
      const response = await apiRequest("POST", "/api/generate-referral", {
        patientName: formData.patientName,
        subjective: sections.subjective || "",
        objective: sections.objective || "",
        assessment: sections.assessment || "",
        plan: sections.plan || "",
        referToSpecialty: params?.specialty || referralSpecialty,
        referralReason: params?.reason || referralReason,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setReferralLetter(data.referralLetter);
      toast({
        title: "Referral letter generated",
        description: "You can now copy or edit the letter",
      });
    },
    onError: () => {
      toast({
        title: "Failed to generate referral",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // Suggest codes mutation
  const codesMutation = useMutation({
    mutationFn: async () => {
      const sections = parseSoapFromText(formData.soapNote);
      const response = await apiRequest("POST", "/api/suggest-codes", {
        subjective: sections.subjective || "",
        objective: sections.objective || "",
        assessment: sections.assessment || "",
        plan: sections.plan || "",
      });
      return response.json();
    },
    onSuccess: async (data) => {
      const normalizedCodes = normalizeSuggestedCodes(data);
      setSuggestedCodes(normalizedCodes);
      setActiveMainTab("codes");
      
      // Auto-save codes to the database (guard against undefined id)
      if (!id) {
        toast({
          title: "Codes suggested",
          description: `Found ${normalizedCodes?.codes?.length || 0} ICD-10 codes and ${normalizedCodes?.cptCodes?.length || 0} CPT codes`,
        });
        return;
      }
      
      try {
        await apiRequest("PATCH", `/api/notes/${id}`, {
          icdCodes: normalizedCodes ? JSON.stringify(normalizedCodes) : null,
        });
        // Invalidate both detail and list caches
        queryClient.invalidateQueries({ queryKey: ["/api/notes", id] });
        queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
        toast({
          title: "Codes suggested & saved",
          description: `Found ${normalizedCodes?.codes?.length || 0} ICD-10 codes and ${normalizedCodes?.cptCodes?.length || 0} CPT codes`,
        });
      } catch (e) {
        toast({
          title: "Codes suggested",
          description: `Found ${normalizedCodes?.codes?.length || 0} ICD-10 codes and ${normalizedCodes?.cptCodes?.length || 0} CPT codes (save failed)`,
        });
      }
    },
    onError: () => {
      toast({
        title: "Failed to suggest codes",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // AI assistant mutation
  const aiChatMutation = useMutation({
    mutationFn: async (question: string) => {
      const response = await apiRequest("POST", "/api/ai-assistant", {
        question,
        context: formData.soapNote,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setChatHistory(prev => [...prev, { role: "assistant", content: data.answer }]);
      setChatQuestion("");
    },
    onError: () => {
      toast({
        title: "AI assistant error",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  // Generate summary mutation
  const summaryMutation = useMutation({
    mutationFn: async () => {
      const sections = parseSoapFromText(formData.soapNote);
      const response = await apiRequest("POST", "/api/generate-summary", {
        patientName: formData.patientName,
        subjective: sections.subjective || "",
        objective: sections.objective || "",
        assessment: sections.assessment || "",
        plan: sections.plan || "",
        summaryType,
      });
      return response.json();
    },
    onSuccess: (data) => {
      const summaryText = (data.summary || "").trim();
      if (!summaryText) {
        toast({
          title: "Summary empty",
          description: "The model returned an empty summary. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setSummaryCache(prev => ({ ...prev, [summaryType]: summaryText }));
      setGeneratedSummary(summaryText);
      setShowSummaryPanel(true);

      if (summaryType === "patient_instructions" && id) {
        apiRequest("PATCH", `/api/notes/${id}`, {
          patientInstructions: summaryText,
        })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/notes", id] });
            toast({
              title: "Summary saved",
              description: "Patient instructions saved to the note.",
            });
          })
          .catch(() => {
            toast({
              title: "Summary generated",
              description: "Generated but failed to save. You can still print.",
            });
          });
      } else {
        toast({
          title: "Summary generated",
          description: "Patient summary is ready",
        });
      }
    },
    onError: () => {
      toast({
        title: "Failed to generate summary",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSendChat = () => {
    if (!chatQuestion.trim()) return;
    setChatHistory(prev => [...prev, { role: "user", content: chatQuestion }]);
    aiChatMutation.mutate(chatQuestion);
  };

  const copyToClipboard = async (text: string) => {
    try {
      // Normalize dash-like Unicode characters for EMR systems with limited glyph support.
      const normalizedText = text.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-");
      await navigator.clipboard.writeText(normalizedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied",
        description: "Note copied to clipboard",
      });
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const printPatientInstructions = async (summaryText: string) => {
    if (!summaryText || !summaryText.trim()) {
      toast({
        title: "No summary to print",
        description: "Generate a summary first, then try printing.",
        variant: "destructive",
      });
      return;
    }

    const summaryTitle = summaryType === "patient_instructions" ? "Patient Instructions" : "Patient Summary";
    const patientLabel = formData.patientName ? `<p style="margin: 4px 0;">Patient: ${formData.patientName}</p>` : "";
    const dateLabel = `<p style="margin: 4px 0;">Date: ${effectiveNoteDate.toLocaleDateString()}</p>`;
    const formattedSummary = summaryText.replace(/\n/g, "<br>");

    const rawHtml = `
      <html>
        <head>
          <title>${summaryTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
            h1 { margin: 0 0 8px; color: #0d9488; }
            .meta { color: #6b7280; margin-bottom: 20px; }
            .content { white-space: normal; line-height: 1.6; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1>${summaryTitle}</h1>
          <div class="meta">
            ${patientLabel}
            ${dateLabel}
          </div>
          <div class="content">${formattedSummary}</div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      toast({
        title: "Popup blocked",
        description: "Allow popups to print the summary.",
        variant: "destructive",
      });
      return;
    }

    let DOMPurify: { sanitize: (value: string) => string };
    try {
      const purifyModule = await import("dompurify");
      DOMPurify = purifyModule.default;
    } catch {
      toast({
        title: "Failed to load printer",
        description: "Please try again.",
        variant: "destructive",
      });
      return;
    }

    printWindow.document.open();
    printWindow.document.write(DOMPurify.sanitize(rawHtml));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const exportToPDF = async () => {
    const confirmedReferralLetters = suggestedReferrals
      .filter(r => r.confirmed && r.letterGenerated)
      .map(r => ({ specialty: r.specialty, letter: r.letterGenerated! }));
    
    if (referralLetter && !confirmedReferralLetters.some(r => r.letter === referralLetter)) {
      confirmedReferralLetters.push({ specialty: referralSpecialty || "Specialist", letter: referralLetter });
    }

    const buildSectionHtml = (title: string, items: string[]) => {
      if (items.length === 0) return '';
      return `
        <div style="margin-top: 24px;">
          <h2 style="color: #0d9488; font-size: 1.2em; margin-top: 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">${title}</h2>
          <ul style="margin: 0; padding-left: 20px;">
            ${items.map(item => `<li style="margin-bottom: 8px;">${item}</li>`).join('')}
          </ul>
        </div>
      `;
    };

    const diagnosesItems = [
      ...(suggestedCodes?.codes || []).map(code => `<strong>${code.code}</strong> - ${code.description}`),
      ...additionalDiagnoses.map(diag => `<strong>${diag.code}</strong> - ${diag.description}`)
    ];
    
    const cptItems = [
      ...(suggestedCodes?.cptCodes || []).map(code => `<strong>${code.code}</strong> - ${code.description}`),
      ...(suggestedCodes?.visitTimeMinutes ? [`<strong>Total time</strong> - ${suggestedCodes.visitTimeMinutes} minutes`] : []),
    ];

    const priorAuthItems = (suggestedCodes?.priorAuthDxCodes || []).map((code) => {
      const medicationPart = code.medication ? ` (Medication: ${code.medication})` : "";
      return `<strong>${code.code}</strong> - ${code.description}${medicationPart}`;
    });
    
    const taskItems = (noteTasks || []).map(task => `${task.title} (${task.category}) - ${task.status === 'completed' ? 'Completed' : 'Pending'}`);

    const referralSections = confirmedReferralLetters.map(r => `
      <div style="margin-top: 24px;">
        <h2 style="color: #0d9488; font-size: 1.2em; margin-top: 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px;">Referral to: ${r.specialty}</h2>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; line-height: 1.6; white-space: pre-wrap;">${r.letter}</div>
      </div>
    `).join('');

    const container = document.createElement('div');
    const rawHtml = `
      <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto;">
        <h1 style="color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 10px; margin-top: 0;">${formData.title || "SOAP Note"}</h1>
        <div style="color: #6b7280; margin-bottom: 24px;">
          ${formData.patientName ? `<p style="margin: 4px 0;">Patient: ${formData.patientName}</p>` : ""}
          <p style="margin: 4px 0;">Date: ${effectiveNoteDate.toLocaleDateString()}</p>
        </div>
        <div style="white-space: pre-wrap; line-height: 1.6;">${formData.soapNote}</div>
        ${buildSectionHtml("Diagnoses", diagnosesItems)}
        ${buildSectionHtml("Billing Codes", cptItems)}
        ${buildSectionHtml("Prior Authorization Dx Support", priorAuthItems)}
        ${buildSectionHtml("Tasks", taskItems)}
        ${referralSections}
      </div>
    `;

    try {
      const [{ default: DOMPurify }, { default: html2pdf }] = await Promise.all([
        import("dompurify"),
        import("html2pdf.js"),
      ]);

      container.innerHTML = DOMPurify.sanitize(rawHtml);

      const filename = `${(formData.title || formData.patientName || "SOAP-Note").replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;

      const opt = {
        margin: 0.5,
        filename,
        image: { type: "jpeg" as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in" as const, format: "letter" as const, orientation: "portrait" as const },
      };

      await html2pdf().set(opt).from(container).save();
      toast({ title: "Downloading PDF", description: "Your SOAP note is being saved as PDF." });
    } catch {
      toast({
        title: "Failed to export PDF",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const shareNote = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: formData.title,
          text: formData.soapNote,
        });
      } catch {
        copyToClipboard(formData.soapNote);
      }
    } else {
      copyToClipboard(formData.soapNote);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-auto bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-10 w-64 mb-4" />
          <Skeleton className="h-6 w-48 mb-8" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Note not found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This note may have been deleted or doesn't exist.
            </p>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden bg-background flex flex-col">
      <div className="border-b bg-background/95 backdrop-blur z-10">
        <div className="flex h-14 items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            
            {/* Undo/Redo buttons */}
            <div className="flex items-center border-r pr-3 mr-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
                data-testid="button-undo"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
                data-testid="button-redo"
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </div>
            
            <span className="text-lg font-semibold truncate max-w-[300px]">
              {note.title}
            </span>
            
            {/* Collaboration indicator */}
            {isConnected && (
              <div className="flex items-center gap-2 ml-2">
                <Badge variant="outline" className="gap-1 text-green-600 border-green-600" data-testid="collaboration-status">
                  <Wifi className="h-3 w-3" />
                  Live
                </Badge>
                <CollaboratorAvatars collaborators={collaborators} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Resume Recording button - primary color to stand out */}
            <Button
              size="sm"
              asChild
              data-testid="button-resume-recording"
            >
              <Link href={`/session?resumeId=${id}&autoStart=true`}>
                <Mic className="h-4 w-4 mr-2" />
                Resume
              </Link>
            </Button>

            {note.transcript?.trim() && (
              <Button
                size="sm"
                variant="outline"
                asChild
                data-testid="button-new-session-from-transcript"
              >
                <Link href={`/session/new?fromNoteId=${id}`}>
                  <ClipboardCopy className="h-4 w-4 mr-2" />
                  New Session
                </Link>
              </Button>
            )}
            
            {/* Drug interaction check button */}
            <DrugInteractionDialog text={formData.soapNote} />
            
            <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-share">
                  <Share2 className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share Note</DialogTitle>
                  <DialogDescription>
                    Share this note with your team or copy it to clipboard
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {practices.length > 0 && (
                    <div className="space-y-3">
                      <Label>Share with Practice</Label>
                      <div className="flex gap-2">
                        <Select value={selectedPracticeId} onValueChange={setSelectedPracticeId}>
                          <SelectTrigger className="flex-1" data-testid="select-share-practice">
                            <SelectValue placeholder="Select a practice" />
                          </SelectTrigger>
                          <SelectContent>
                            {practices.map(({ practice }) => (
                              <SelectItem key={practice.id} value={practice.id.toString()}>
                                {practice.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={() => {
                            if (selectedPracticeId) {
                              shareWithPracticeMutation.mutate(parseInt(selectedPracticeId));
                            }
                          }}
                          disabled={!selectedPracticeId || shareWithPracticeMutation.isPending}
                          data-testid="button-share-with-practice"
                        >
                          {shareWithPracticeMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Users className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      
                      {noteShares.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm text-muted-foreground">Currently shared with:</Label>
                          {noteShares.map((share) => {
                            const practice = practices.find(p => p.practice.id === share.sharedWithPracticeId);
                            return (
                              <div key={share.id} className="flex items-center justify-between p-2 bg-muted rounded">
                                <span className="text-sm">
                                  {practice?.practice.name || `Practice #${share.sharedWithPracticeId}`}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => unshareMutation.mutate(share.id)}
                                  disabled={unshareMutation.isPending}
                                  data-testid={`button-unshare-${share.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div className="border-t pt-4">
                    <Label className="mb-2 block">Or share via:</Label>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={shareNote} data-testid="button-share-native">
                        <Share2 className="h-4 w-4 mr-2" />
                        Share
                      </Button>
                      <Button variant="outline" className="flex-1" onClick={() => copyToClipboard(formData.soapNote)} data-testid="button-copy-note">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy to Clipboard
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="icon" onClick={exportToPDF} data-testid="button-export">
              <Download className="h-4 w-4" />
            </Button>
            
            {/* Delete button with confirmation dialog */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" data-testid="button-delete-note">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Note</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this note? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteNoteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteNoteMutation.isPending}
                    data-testid="button-confirm-delete"
                  >
                    {deleteNoteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5" data-testid="container-note-copied-to-emr">
              <Checkbox
                id="checkbox-note-copied-to-emr"
                checked={isCopiedToEmr}
                onCheckedChange={(checked) => {
                  if (noteId > 0) {
                    setNoteCopiedToEmr(noteId, checked === true);
                  }
                }}
                data-testid="checkbox-note-copied-to-emr"
              />
              <Label htmlFor="checkbox-note-copied-to-emr" className="cursor-pointer whitespace-nowrap text-sm">
                Copied to EMR
              </Label>
            </div>
            
            <ThemeToggle />
            
            {/* Copy to EMR button - only show if user has EMR access */}
            {hasEmrAccess && (
              <Dialog open={showCopyToEmrDialog} onOpenChange={setShowCopyToEmrDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-copy-to-emr">
                    <ClipboardCopy className="h-4 w-4 mr-2" />
                    Link to EMR
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Link Note to EMR Patient</DialogTitle>
                    <DialogDescription>
                      Select a patient to link this transcription to their EMR chart. The note will be visible in the patient's Visit Notes.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Select Patient</Label>
                      <Select value={selectedEmrPatientId} onValueChange={setSelectedEmrPatientId}>
                        <SelectTrigger data-testid="select-emr-patient">
                          <SelectValue placeholder="Choose a patient..." />
                        </SelectTrigger>
                        <SelectContent>
                          {emrPatients.map((patient) => (
                            <SelectItem key={patient.id} value={patient.id.toString()}>
                              {patient.firstName} {patient.lastName}
                              {patient.dateOfBirth && ` (DOB: ${new Date(patient.dateOfBirth).toLocaleDateString()})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {note?.patientId && (
                      <p className="text-sm text-muted-foreground">
                        This note is already linked to a patient record.
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowCopyToEmrDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedEmrPatientId) {
                          copyToEmrMutation.mutate(parseInt(selectedEmrPatientId));
                        }
                      }}
                      disabled={!selectedEmrPatientId || copyToEmrMutation.isPending}
                      data-testid="button-confirm-link-emr"
                    >
                      {copyToEmrMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Linking...
                        </>
                      ) : (
                        "Link to Patient"
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {note.patientName && (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span>{note.patientName}</span>
              </div>
            )}
            {isEditingNoteDateTime ? (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <Input
                  type="datetime-local"
                  value={formData.noteDateTime}
                  onChange={(e) => setFormData({ ...formData, noteDateTime: e.target.value })}
                  className="h-8 w-[220px]"
                  data-testid="input-note-datetime"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditingNoteDateTime(false);
                    updateMutation.mutate();
                  }}
                  disabled={updateMutation.isPending}
                  data-testid="button-done-note-datetime"
                >
                  Done
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60 hover:text-foreground"
                onClick={() => setIsEditingNoteDateTime(true)}
                data-testid="button-edit-note-datetime"
              >
                <Calendar className="h-4 w-4" />
                <span>{effectiveNoteDate.toLocaleDateString()}</span>
                <Clock className="h-4 w-4 ml-2" />
                <span>{effectiveNoteDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
              </button>
            )}
          </div>

          {/* Title/Patient Card */}
          <Card data-testid="card-details">
            <CardContent className="pt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  data-testid="input-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientName">Patient Name</Label>
                <Input
                  id="patientName"
                  value={formData.patientName}
                  onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                  data-testid="input-patient-name"
                />
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
              <TabsTrigger value="soap" data-testid="tab-note-view-soap">SOAP</TabsTrigger>
              <TabsTrigger value="transcript" data-testid="tab-note-view-transcript" disabled={!note.transcript}>
                Transcript
              </TabsTrigger>
              <TabsTrigger value="codes" data-testid="tab-note-view-codes">Dx Codes</TabsTrigger>
              <TabsTrigger value="ai-tools" data-testid="tab-note-view-ai-tools">AI Tools</TabsTrigger>
            </TabsList>

            <TabsContent value="soap" className="space-y-4">
              <Card data-testid="card-soap">
                <CardHeader className="pb-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        SOAP Note
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Select value={selectedTemplateId || "default"} onValueChange={(val) => setSelectedTemplateId(val === "default" ? "" : val === "none" ? "none" : val)}>
                          <SelectTrigger className="w-[140px] text-xs" data-testid="select-template-header">
                            <SelectValue placeholder="Template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            <SelectItem value="none">No template</SelectItem>
                            {templates.map((template) => (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => regenerateMutation.mutate()}
                          disabled={regenerateMutation.isPending || !note.transcript}
                          data-testid="button-retranscribe"
                        >
                          {regenerateMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Redo
                            </>
                          )}
                        </Button>
                        {note.transcript && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveMainTab("transcript")}
                            data-testid="button-toggle-transcript-header"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Transcript
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(formData.soapNote)}
                          data-testid="button-copy-soap"
                        >
                          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground" data-testid="text-cumulative-visit-time">
                      Cumulative transcript time:{" "}
                      <span className="font-medium">{cumulativeVisitMinutes ? `${cumulativeVisitMinutes} minutes` : "Not available yet"}</span>
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DrugInteractionAlert text={formData.soapNote} />
                  <MedicalAutocomplete
                    value={formData.soapNote}
                    onChange={(value) => {
                      setFormData({ ...formData, soapNote: value });
                      sendUpdate("soapNote", value);
                    }}
                    className="text-base leading-relaxed"
                    autoResize={true}
                    minHeight={300}
                    placeholder="SUBJECTIVE:
Patient's symptoms...

OBJECTIVE:
Examination findings...

ASSESSMENT:
Diagnosis...

PLAN:
Treatment plan..."
                    data-testid="textarea-soap"
                  />

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAiInstructions(!showAiInstructions)}
                    className="text-xs text-muted-foreground"
                    data-testid="button-toggle-ai"
                  >
                    <Wand2 className="mr-1 h-3 w-3" />
                    AI Instructions
                    {showAiInstructions ? (
                      <ChevronUp className="ml-1 h-3 w-3" />
                    ) : (
                      <ChevronDown className="ml-1 h-3 w-3" />
                    )}
                  </Button>

                  {showAiInstructions && (
                    <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Template</Label>
                        <Select value={selectedTemplateId || "default"} onValueChange={(val) => setSelectedTemplateId(val === "default" ? "" : val === "none" ? "none" : val)}>
                          <SelectTrigger data-testid="select-regenerate-template">
                            <SelectValue placeholder="Use default template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Default (uses your default template)</SelectItem>
                            <SelectItem value="none">No template (standard SOAP)</SelectItem>
                            {templates.map((template) => (
                              <SelectItem key={template.id} value={template.id.toString()}>
                                {template.name}
                                {template.isDefault && " ★"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          "Default" uses your default template if set in Templates page
                        </p>
                      </div>
                      <Textarea
                        placeholder="Tell the AI what to include, omit, or modify. For example: 'Omit personal family history' or 'Focus more on chest pain symptoms' or 'Add that patient has history of diabetes'"
                        value={aiInstructions}
                        onChange={(e) => setAiInstructions(e.target.value)}
                        className="min-h-[80px]"
                        data-testid="textarea-ai-instructions"
                      />
                      <Button
                        variant="secondary"
                        onClick={() => regenerateMutation.mutate()}
                        disabled={regenerateMutation.isPending || !note.transcript}
                        className="w-full"
                        data-testid="button-regenerate"
                      >
                        {regenerateMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Regenerating...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Regenerate SOAP Note
                          </>
                        )}
                      </Button>
                      {!note.transcript && (
                        <p className="text-xs text-muted-foreground text-center">
                          Regeneration requires a transcript.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Select value={translateLanguage} onValueChange={setTranslateLanguage}>
                      <SelectTrigger className="w-[100px] text-xs" data-testid="select-translate-language">
                        <SelectValue placeholder="Language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="pt">Portuguese</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => translateMutation.mutate(translateLanguage)}
                      disabled={translateMutation.isPending || !formData.soapNote}
                      className="text-xs text-muted-foreground"
                      data-testid="button-translate"
                    >
                      {translateMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Languages className="mr-1 h-3 w-3" />
                          Translate
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="transcript" className="space-y-4">
              {note.transcript ? (
                <Card data-testid="card-transcript">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AudioLines className="h-4 w-4 text-primary" />
                        Transcript
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={openSplitTranscriptDialog}
                          disabled={!hasTranscriptSelection || splitTranscriptMutation.isPending}
                          data-testid="button-split-transcript"
                        >
                          {splitTranscriptMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Scissors className="h-3 w-3 mr-1" />
                          )}
                          Split selection
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(note.transcript || "")}
                          data-testid="button-copy-transcript"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Textarea
                      readOnly
                      value={note.transcript || ""}
                      onSelect={handleTranscriptSelectionChange}
                      onMouseUp={handleTranscriptSelectionChange}
                      onKeyUp={handleTranscriptSelectionChange}
                      className="min-h-[260px] text-base leading-relaxed bg-muted/50"
                      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                      data-testid="textarea-transcript-readonly"
                    />
                    <p className="mt-2 text-xs text-muted-foreground" data-testid="text-transcript-selection-hint">
                      {hasTranscriptSelection
                        ? `${transcriptSelection.text.trim().length} characters selected. Click "Split selection" to move it to a new note.`
                        : "Highlight transcript text to split it into a new note."}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card data-testid="card-transcript-empty">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No transcript is available for this note.
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="codes" className="space-y-4">
              <Card data-testid="card-dx-codes">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Code2 className="h-4 w-4 text-primary" />
                      Dx/Codes
                    </CardTitle>
                    <Button
                      onClick={() => codesMutation.mutate()}
                      disabled={codesMutation.isPending}
                      data-testid="button-generate-dx-codes"
                    >
                      {codesMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Suggest Codes
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {suggestedCodes ? (
                    <>
                      {suggestedCodes.codes && suggestedCodes.codes.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-sm font-medium">ICD-10 Codes</h5>
                          {suggestedCodes.codes.map((code, i) => (
                            <div key={i} className="flex items-start gap-2 p-3 bg-muted/40 rounded border text-sm">
                              <Badge variant={code.category === "primary" ? "default" : "secondary"}>
                                {code.code}
                              </Badge>
                              <div className="flex-1 min-w-0">
                                <p>{code.description}</p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(code.code)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {suggestedCodes.cptCodes && suggestedCodes.cptCodes.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-sm font-medium">CPT Codes</h5>
                          {suggestedCodes.cptCodes.map((code, i) => (
                            <div key={i} className="flex items-start gap-2 p-3 bg-muted/40 rounded border text-sm">
                              <Badge variant="outline">{code.code}</Badge>
                              <div className="flex-1 min-w-0">
                                <p>{code.description}</p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(code.code)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {suggestedCodes.priorAuthDxCodes && suggestedCodes.priorAuthDxCodes.length > 0 && (
                        <div className="space-y-2">
                          <h5 className="text-sm font-medium">Likely Prior Authorization Dx Codes</h5>
                          {suggestedCodes.priorAuthDxCodes.map((code, i) => (
                            <div key={`pa-${i}`} className="flex items-start gap-2 p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded border text-sm">
                              <Badge variant="outline">{code.code}</Badge>
                              <div className="flex-1 min-w-0 space-y-1">
                                <p>{code.description}</p>
                                {code.medication ? (
                                  <p className="text-xs text-muted-foreground">
                                    Medication: {code.medication}
                                  </p>
                                ) : null}
                                {code.rationale ? (
                                  <p className="text-xs text-muted-foreground">
                                    {code.rationale}
                                  </p>
                                ) : null}
                              </div>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(code.code)}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No code suggestions yet. Click "Suggest Codes" to generate ICD-10/CPT recommendations.
                    </p>
                  )}

                  <div className="rounded-md border bg-muted/20 p-3 space-y-2" data-testid="card-billable-time">
                    <div className="flex items-center justify-between gap-2">
                      <h5 className="text-sm font-medium">Time-Based Billing</h5>
                      {saveBillableTimeMutation.isPending && (
                        <span className="inline-flex items-center text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Saving...
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Record total time spent with the patient (minutes). This is prefilled from suggested E/M CPT levels when available.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={billableTimeInput}
                        onChange={(e) => setBillableTimeInput(e.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveBillableTime();
                          }
                        }}
                        disabled={!suggestedCodes}
                        placeholder={suggestedCodes ? "Minutes (e.g., 25)" : "Generate codes first"}
                        className="sm:max-w-[220px]"
                        data-testid="input-billable-time-minutes"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={saveBillableTime}
                        disabled={!suggestedCodes || saveBillableTimeMutation.isPending}
                        data-testid="button-save-billable-time"
                      >
                        Save Time
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <h5 className="text-sm font-medium">Manual Diagnosis</h5>
                    <div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
                      <Input
                        placeholder="Code (e.g., J06.9)"
                        value={newDiagnosisCode}
                        onChange={(e) => setNewDiagnosisCode(e.target.value)}
                        data-testid="input-manual-diagnosis-code"
                      />
                      <Input
                        placeholder="Description"
                        value={newDiagnosisDesc}
                        onChange={(e) => setNewDiagnosisDesc(e.target.value)}
                        data-testid="input-manual-diagnosis-description"
                      />
                      <Button onClick={addManualDiagnosis} disabled={!newDiagnosisCode.trim()} data-testid="button-add-manual-diagnosis">
                        Add
                      </Button>
                    </div>
                    {additionalDiagnoses.length > 0 && (
                      <div className="space-y-2">
                        {additionalDiagnoses.map((diag, index) => (
                          <div key={`${diag.code}-${index}`} className="flex items-start gap-2 p-3 bg-muted/40 rounded border text-sm">
                            <Badge variant="secondary">{diag.code}</Badge>
                            <div className="flex-1">{diag.description}</div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeManualDiagnosis(index)}
                              data-testid={`button-remove-manual-diagnosis-${index}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ai-tools" className="space-y-4">
              <Card data-testid="card-ai-tools">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Tools
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    <Button
                      variant="outline"
                      className="flex flex-col h-auto py-3"
                      onClick={handleOpenTaskModal}
                      data-testid="button-create-task-panel"
                    >
                      <ListTodo className="h-5 w-5 mb-1" />
                      <span className="text-xs">Add Task</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex flex-col h-auto py-3"
                      onClick={handleOpenReferralModal}
                      data-testid="button-referral-panel"
                    >
                      <FileSignature className="h-5 w-5 mb-1" />
                      <span className="text-xs">Referral</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex flex-col h-auto py-3"
                      onClick={() => setShowAiChat(!showAiChat)}
                      data-testid="button-ai-chat-panel"
                    >
                      <MessageSquare className="h-5 w-5 mb-1" />
                      <span className="text-xs">AI Chat</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex flex-col h-auto py-3"
                      onClick={() => setShowSummaryPanel(!showSummaryPanel)}
                      data-testid="button-summary-panel"
                    >
                      <ClipboardList className="h-5 w-5 mb-1" />
                      <span className="text-xs">Summary</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex flex-col h-auto py-3"
                      onClick={() => setActiveMainTab("codes")}
                      data-testid="button-open-codes-tab"
                    >
                      <Code2 className="h-5 w-5 mb-1" />
                      <span className="text-xs">Dx Codes</span>
                    </Button>
                  </div>

                  {showAiChat && (
                    <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">AI Assistant</h4>
                        <Button variant="ghost" size="icon" onClick={() => setShowAiChat(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="max-h-[220px] overflow-auto space-y-2">
                        {chatHistory.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Ask questions about documentation or clinical guidance
                          </p>
                        )}
                        {chatHistory.map((msg, i) => (
                          <div key={i} className={`p-2 rounded text-xs ${msg.role === "user" ? "bg-primary/10 ml-4" : "bg-background mr-4 border"}`}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ask a question..."
                          value={chatQuestion}
                          onChange={(e) => setChatQuestion(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                          className="text-xs"
                        />
                        <Button size="icon" onClick={handleSendChat} disabled={aiChatMutation.isPending || !chatQuestion.trim()}>
                          {aiChatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  )}

                  {showSummaryPanel && (
                    <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Patient Summary</h4>
                        <Button variant="ghost" size="icon" onClick={() => setShowSummaryPanel(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Select value={summaryType} onValueChange={setSummaryType}>
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="brief">Brief</SelectItem>
                            <SelectItem value="detailed">Detailed</SelectItem>
                            <SelectItem value="handover">Handover</SelectItem>
                            <SelectItem value="discharge">Discharge</SelectItem>
                            <SelectItem value="patient_instructions">Patient Instructions</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => summaryMutation.mutate()} disabled={summaryMutation.isPending}>
                          {summaryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
                        </Button>
                      </div>
                      {generatedSummary && (
                        <div className="p-2 bg-background rounded border">
                          <div className="flex justify-end gap-1 mb-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(generatedSummary)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => printPatientInstructions(generatedSummary)}
                            >
                              <Printer className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-xs whitespace-pre-wrap">{generatedSummary}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {showReferralModal && (
                    <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Referrals</h4>
                        <Button variant="ghost" size="icon" onClick={() => setShowReferralModal(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-medium">Suggested</h5>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchSuggestedReferrals} disabled={isLoadingReferrals}>
                            {isLoadingReferrals ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          </Button>
                        </div>
                        {isLoadingReferrals ? (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : suggestedReferrals.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-1">No referrals suggested</p>
                        ) : (
                          <div className="space-y-1">
                            {suggestedReferrals.map((ref, index) => (
                              <div key={index} className={`flex items-start gap-2 p-2 rounded border text-xs ${ref.confirmed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-background'}`}>
                                <div className="flex-1">
                                  <p className="font-medium">{ref.specialty}</p>
                                  <Badge variant={ref.urgency === 'urgent' || ref.urgency === 'emergent' ? 'destructive' : 'secondary'} className="text-xs">
                                    {ref.urgency}
                                  </Badge>
                                </div>
                                {!ref.confirmed && (
                                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => confirmSuggestedReferral(ref, index)}>
                                    <FileSignature className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="border-t pt-2 space-y-2">
                        <h5 className="text-xs font-medium">Create Manually</h5>
                        <Input
                          placeholder="Specialty"
                          value={referralSpecialty}
                          onChange={(e) => setReferralSpecialty(e.target.value)}
                          className="text-xs"
                        />
                        <Input
                          placeholder="Reason"
                          value={referralReason}
                          onChange={(e) => setReferralReason(e.target.value)}
                          className="text-xs"
                        />
                        <Button size="sm" className="w-full" onClick={() => referralMutation.mutate({})} disabled={referralMutation.isPending}>
                          {referralMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate Letter"}
                        </Button>
                      </div>
                      {referralLetter && (
                        <div className="p-2 bg-background rounded border">
                          <div className="flex justify-end mb-1 gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(referralLetter)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReferralLetter("")}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <Textarea
                            value={referralLetter}
                            onChange={(e) => setReferralLetter(e.target.value)}
                            className="min-h-[150px] text-xs"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {showTaskModal && (
                    <div className="p-3 bg-muted/50 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-sm">Tasks</h4>
                        <Button variant="ghost" size="icon" onClick={() => setShowTaskModal(false)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h5 className="text-xs font-medium">Suggested</h5>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchSuggestedTasks} disabled={isLoadingSuggestedTasks}>
                            {isLoadingSuggestedTasks ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          </Button>
                        </div>
                        {isLoadingSuggestedTasks ? (
                          <div className="flex items-center justify-center py-2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : suggestedTasks.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-1">No tasks suggested</p>
                        ) : (
                          <div className="space-y-1">
                            {suggestedTasks.map((task, index) => (
                              <div key={index} className={`flex items-start gap-2 p-2 rounded border text-xs ${task.confirmed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-background'}`}>
                                <div className="flex-1">
                                  <p className="font-medium">{task.title}</p>
                                  <Badge variant="outline" className="text-xs">{task.category}</Badge>
                                </div>
                                {!task.confirmed && (
                                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => confirmSuggestedTask(task, index)}>
                                    <Check className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="border-t pt-2 space-y-2">
                        <h5 className="text-xs font-medium">Add Manually</h5>
                        <Input
                          placeholder="Task description"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          className="text-xs"
                        />
                        <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                          <SelectTrigger className="text-xs">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="w-full" onClick={handleCreateTask} disabled={!newTaskTitle.trim() || createTaskMutation.isPending}>
                          {createTaskMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Task"}
                        </Button>
                      </div>
                      {noteTasks && noteTasks.length > 0 && (
                        <div className="border-t pt-2">
                          <h5 className="text-xs font-medium mb-1">Linked Tasks ({noteTasks.length})</h5>
                          <div className="space-y-1">
                            {noteTasks.slice(0, 3).map((task) => (
                              <div key={task.id} className="flex items-center gap-2 text-xs p-1 bg-background rounded">
                                <ListTodo className="h-3 w-3 text-muted-foreground" />
                                <span className={task.status === "completed" ? "line-through text-muted-foreground" : ""}>
                                  {task.title}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog
        open={showSplitTranscriptDialog}
        onOpenChange={(open) => {
          if (!splitTranscriptMutation.isPending) {
            setShowSplitTranscriptDialog(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-4 w-4" />
              Split Transcript Selection
            </DialogTitle>
            <DialogDescription>
              This will create a new note from the highlighted transcript and remove that text from this note.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="split-note-title">New note title</Label>
              <Input
                id="split-note-title"
                value={splitNoteTitle}
                onChange={(e) => setSplitNoteTitle(e.target.value)}
                placeholder="Enter a title for the new split note"
                data-testid="input-split-note-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="split-note-patient-name">Patient name (optional)</Label>
              <Input
                id="split-note-patient-name"
                value={splitPatientName}
                onChange={(e) => setSplitPatientName(e.target.value)}
                placeholder="Patient name for the new note"
                data-testid="input-split-note-patient-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Selected transcript preview</Label>
              <Textarea
                readOnly
                value={transcriptSelection.text.trim()}
                className="min-h-[120px]"
                data-testid="textarea-split-transcript-preview"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSplitTranscriptDialog(false)}
              disabled={splitTranscriptMutation.isPending}
              data-testid="button-cancel-split-transcript"
            >
              Cancel
            </Button>
            <Button
              onClick={() => splitTranscriptMutation.mutate()}
              disabled={!hasTranscriptSelection || splitTranscriptMutation.isPending}
              data-testid="button-confirm-split-transcript"
            >
              {splitTranscriptMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Splitting...
                </>
              ) : (
                <>
                  <Scissors className="h-4 w-4 mr-2" />
                  Split Into New Note
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
