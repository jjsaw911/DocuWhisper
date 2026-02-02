import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams, useLocation } from "wouter";
import { useState, useEffect, useCallback, useMemo } from "react";
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
  Info,
  Pill,
  Wifi,
  WifiOff,
  ClipboardCopy,
  Mic
} from "lucide-react";
import { DrugInteractionAlert, DrugInteractionDialog } from "@/components/drug-interaction-alert";
import { useCollaboration } from "@/hooks/use-collaboration";
import { CollaboratorAvatars } from "@/components/collaborator-avatars";
import { MedicalAutocomplete } from "@/components/medical-autocomplete";
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
import type { Note, Task, Template, Practice, SharedNote } from "@shared/schema";

const TASK_CATEGORIES = [
  { value: "document", label: "Document", icon: FileText },
  { value: "order", label: "Order", icon: ShoppingCart },
  { value: "coordinate", label: "Coordinate", icon: Users },
  { value: "communicate", label: "Communicate", icon: MessageSquare },
];

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
    if (note.subjective) parts.push(`SUBJECTIVE:\n${note.subjective}`);
    if (note.objective) parts.push(`OBJECTIVE:\n${note.objective}`);
    if (note.assessment) parts.push(`ASSESSMENT:\n${note.assessment}`);
    if (note.plan) parts.push(`PLAN:\n${note.plan}`);
    return parts.join("\n\n");
  }, [note]);

  // Real-time collaboration hook
  const noteId = id ? parseInt(id) : 0;
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
  });
  const [aiInstructions, setAiInstructions] = useState("");
  const [showAiInstructions, setShowAiInstructions] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [translateLanguage, setTranslateLanguage] = useState("es");
  
  // New feature states
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralSpecialty, setReferralSpecialty] = useState("");
  const [referralReason, setReferralReason] = useState("");
  const [referralLetter, setReferralLetter] = useState("");
  
  const [showCodesPanel, setShowCodesPanel] = useState(false);
  const [suggestedCodes, setSuggestedCodes] = useState<{
    codes: { code: string; description: string; category: string; confidence: string }[];
    cptCodes: { code: string; description: string; rationale: string }[];
  } | null>(null);
  
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
      setShowTaskModal(false);
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
    if (note.subjective) parts.push(`SUBJECTIVE:\n${note.subjective}`);
    if (note.objective) parts.push(`OBJECTIVE:\n${note.objective}`);
    if (note.assessment) parts.push(`ASSESSMENT:\n${note.assessment}`);
    if (note.plan) parts.push(`PLAN:\n${note.plan}`);
    return parts.join("\n\n");
  };

  const parseSoapNote = (text: string) => {
    const sections: { subjective: string; objective: string; assessment: string; plan: string } = {
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
    };

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

  useEffect(() => {
    if (note) {
      setFormData({
        title: note.title || "",
        patientName: note.patientName || "",
        soapNote: formatSoapNote(note),
      });
    }
  }, [note]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const parsedSoap = parseSoapNote(formData.soapNote);
      const response = await apiRequest("PATCH", `/api/notes/${id}`, {
        title: formData.title,
        patientName: formData.patientName,
        ...parsedSoap,
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

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/generate-soap", {
        transcript: note?.transcript || "",
        patientName: formData.patientName,
        specialty: note?.specialty || "general",
        aiInstructions: aiInstructions,
        templateId: selectedTemplateId ? parseInt(selectedTemplateId) : undefined,
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
      setShowAiInstructions(false);
      toast({
        title: "SOAP note regenerated",
        description: "The note has been regenerated with your instructions",
      });
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
    onSuccess: (data) => {
      setSuggestedCodes(data);
      setShowCodesPanel(true);
      toast({
        title: "Codes suggested",
        description: `Found ${data.codes?.length || 0} ICD-10 codes and ${data.cptCodes?.length || 0} CPT codes`,
      });
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
      setGeneratedSummary(data.summary);
      toast({
        title: "Summary generated",
        description: "Patient summary is ready",
      });
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
      await navigator.clipboard.writeText(text);
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

  const exportToPDF = () => {
    // Build sections for confirmed items
    const confirmedTasksHtml = noteTasks && noteTasks.length > 0 ? `
      <div class="section">
        <h2>Tasks</h2>
        <ul>
          ${noteTasks.map(task => `<li>${task.title} (${task.category}) - ${task.status === 'completed' ? 'Completed' : 'Pending'}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    const hasDiagnoses = (suggestedCodes?.codes && suggestedCodes.codes.length > 0) || additionalDiagnoses.length > 0;
    const diagnosesHtml = hasDiagnoses ? `
      <div class="section">
        <h2>Diagnoses</h2>
        <ul>
          ${(suggestedCodes?.codes || []).map(code => `<li><strong>${code.code}</strong> - ${code.description}</li>`).join('')}
          ${additionalDiagnoses.map(diag => `<li><strong>${diag.code}</strong> - ${diag.description}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    const hasCptCodes = suggestedCodes?.cptCodes && suggestedCodes.cptCodes.length > 0;
    const cptCodesHtml = hasCptCodes ? `
      <div class="section">
        <h2>Billing Codes</h2>
        <ul>
          ${(suggestedCodes?.cptCodes || []).map(code => `<li><strong>${code.code}</strong> - ${code.description}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    // Collect all confirmed referral letters
    const confirmedReferralLetters = suggestedReferrals
      .filter(r => r.confirmed && r.letterGenerated)
      .map(r => ({ specialty: r.specialty, letter: r.letterGenerated! }));
    
    // Include manual referral letter if present
    if (referralLetter && !confirmedReferralLetters.some(r => r.letter === referralLetter)) {
      confirmedReferralLetters.push({ specialty: referralSpecialty || "Specialist", letter: referralLetter });
    }

    const referralHtml = confirmedReferralLetters.length > 0 ? `
      <div class="section">
        <h2>Referral Letters</h2>
        ${confirmedReferralLetters.map(r => `
          <div class="referral-content">
            <p><strong>Referral to: ${r.specialty}</strong></p>
            ${r.letter.replace(/\n/g, '<br>')}
          </div>
        `).join('')}
      </div>
    ` : '';

    const content = `
      <html>
        <head>
          <title>${formData.title || "SOAP Note"}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 10px; }
            h2 { color: #0d9488; font-size: 1.2em; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
            .meta { color: #6b7280; margin-bottom: 24px; }
            .content { white-space: pre-wrap; line-height: 1.6; }
            .section { margin-top: 24px; }
            .section ul { margin: 0; padding-left: 20px; }
            .section li { margin-bottom: 8px; }
            .referral-content { background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 12px; line-height: 1.6; }
            @media print {
              .section { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <h1>${formData.title || "SOAP Note"}</h1>
          <div class="meta">
            ${formData.patientName ? `<p>Patient: ${formData.patientName}</p>` : ""}
            <p>Date: ${note ? new Date(note.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</p>
          </div>
          <div class="content">${formData.soapNote}</div>
          ${diagnosesHtml}
          ${cptCodesHtml}
          ${confirmedTasksHtml}
          ${referralHtml}
        </body>
      </html>
    `;
    
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
      printWindow.print();
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
    <div className="h-full overflow-auto bg-background">
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex h-14 items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
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

      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {note.patientName && (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span>{note.patientName}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{new Date(note.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{new Date(note.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        <Card data-testid="card-details" className="mb-6">
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

        <Card data-testid="card-soap" className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                SOAP Note
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Template dropdown */}
                <Select value={selectedTemplateId || "default"} onValueChange={(val) => setSelectedTemplateId(val === "default" ? "" : val)}>
                  <SelectTrigger className="w-[140px] text-xs" data-testid="select-template-header">
                    <SelectValue placeholder="Template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Re-transcribe button */}
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
                
                {/* Transcript toggle - only show if transcript exists */}
                {note.transcript && (
                  <Button 
                    variant={showTranscript ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setShowTranscript(!showTranscript)}
                    data-testid="button-toggle-transcript-header"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Transcript
                    {showTranscript ? (
                      <ChevronUp className="ml-1 h-3 w-3" />
                    ) : (
                      <ChevronDown className="ml-1 h-3 w-3" />
                    )}
                  </Button>
                )}
                
                {/* Copy button */}
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
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Drug interaction alert */}
            <DrugInteractionAlert text={formData.soapNote} />
            
            <MedicalAutocomplete
              value={formData.soapNote}
              onChange={(value) => {
                setFormData({ ...formData, soapNote: value });
                // Send update to collaborators
                sendUpdate("soapNote", value);
              }}
              className="min-h-[400px] text-base leading-relaxed"
              rows={16}
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
                  <Select value={selectedTemplateId || "default"} onValueChange={(val) => setSelectedTemplateId(val === "default" ? "" : val)}>
                    <SelectTrigger data-testid="select-regenerate-template">
                      <SelectValue placeholder="Use default template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default (no template)</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          {template.name}
                          {template.isDefault && " (Default)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose a template to change how the SOAP note is generated
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

        {/* AI Tools Section */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="flex flex-col items-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleOpenTaskModal}
                  data-testid="button-create-task"
                >
                  <ListTodo className="h-5 w-5" />
                </Button>
                <span className="text-xs mt-1 text-muted-foreground">Add Task</span>
              </div>
              <div className="flex flex-col items-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleOpenReferralModal}
                  data-testid="button-referral"
                >
                  <FileSignature className="h-5 w-5" />
                </Button>
                <span className="text-xs mt-1 text-muted-foreground">Referral</span>
              </div>
              <div className="flex flex-col items-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => codesMutation.mutate()}
                  disabled={codesMutation.isPending}
                  data-testid="button-codes"
                >
                  {codesMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Code2 className="h-5 w-5" />
                  )}
                </Button>
                <span className="text-xs mt-1 text-muted-foreground">ICD-10</span>
              </div>
              <div className="flex flex-col items-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowAiChat(!showAiChat)}
                  data-testid="button-ai-chat"
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
                <span className="text-xs mt-1 text-muted-foreground">AI Chat</span>
              </div>
              <div className="flex flex-col items-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowSummaryPanel(!showSummaryPanel)}
                  data-testid="button-summary"
                >
                  <ClipboardList className="h-5 w-5" />
                </Button>
                <span className="text-xs mt-1 text-muted-foreground">Summary</span>
              </div>
            </div>

            {/* ICD-10 Codes Panel */}
            {showCodesPanel && suggestedCodes && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4" data-testid="panel-codes">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Billing Codes & Diagnoses</h4>
                  <Button variant="ghost" size="icon" onClick={() => setShowCodesPanel(false)} data-testid="button-close-codes">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {suggestedCodes.codes && suggestedCodes.codes.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium mb-2">AI Suggested ICD-10 Codes</h5>
                    <div className="space-y-2">
                      {suggestedCodes.codes.map((code, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-background rounded border">
                          <Badge variant={code.category === "primary" ? "default" : "secondary"}>
                            {code.code}
                          </Badge>
                          <div className="flex-1">
                            <p className="text-sm">{code.description}</p>
                            <p className="text-xs text-muted-foreground capitalize">{code.category} - {code.confidence} confidence</p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => copyToClipboard(code.code)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manually Added Diagnoses */}
                {additionalDiagnoses.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium mb-2">Additional Diagnoses</h5>
                    <div className="space-y-2">
                      {additionalDiagnoses.map((diag, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-background rounded border">
                          <Badge variant="outline">{diag.code}</Badge>
                          <div className="flex-1">
                            <p className="text-sm">{diag.description}</p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeManualDiagnosis(i)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Manual Diagnosis */}
                <div className="border-t pt-3">
                  <h5 className="text-sm font-medium mb-2">Add Diagnosis Manually</h5>
                  <div className="flex gap-2">
                    <Input
                      placeholder="ICD-10 Code"
                      value={newDiagnosisCode}
                      onChange={(e) => setNewDiagnosisCode(e.target.value)}
                      className="w-32"
                      data-testid="input-diagnosis-code"
                    />
                    <Input
                      placeholder="Description"
                      value={newDiagnosisDesc}
                      onChange={(e) => setNewDiagnosisDesc(e.target.value)}
                      className="flex-1"
                      data-testid="input-diagnosis-desc"
                    />
                    <Button 
                      onClick={addManualDiagnosis}
                      disabled={!newDiagnosisCode.trim()}
                      size="icon"
                      data-testid="button-add-diagnosis"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {suggestedCodes.cptCodes && suggestedCodes.cptCodes.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium mb-2">CPT E/M Codes</h5>
                    <div className="space-y-2">
                      {suggestedCodes.cptCodes.map((code, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 bg-background rounded border">
                          <Badge variant="outline">{code.code}</Badge>
                          <div className="flex-1">
                            <p className="text-sm">{code.description}</p>
                            <p className="text-xs text-muted-foreground">{code.rationale}</p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => copyToClipboard(code.code)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Chat Panel */}
            {showAiChat && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4" data-testid="panel-ai-chat">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">AI Assistant</h4>
                  <Button variant="ghost" size="icon" onClick={() => setShowAiChat(false)} data-testid="button-close-ai-chat">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="max-h-[300px] overflow-auto space-y-3">
                  {chatHistory.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Ask questions about documentation, coding, or clinical guidance
                    </p>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`p-3 rounded-lg ${msg.role === "user" ? "bg-primary/10 ml-8" : "bg-background mr-8 border"}`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                </div>
                
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask a question..."
                    value={chatQuestion}
                    onChange={(e) => setChatQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                    data-testid="input-ai-chat"
                  />
                  <Button onClick={handleSendChat} disabled={aiChatMutation.isPending || !chatQuestion.trim()} data-testid="button-send-ai-chat">
                    {aiChatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Patient Summary Panel */}
            {showSummaryPanel && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4" data-testid="panel-summary">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Generate Patient Summary</h4>
                  <Button variant="ghost" size="icon" onClick={() => setShowSummaryPanel(false)} data-testid="button-close-summary">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex gap-2">
                  <Select value={summaryType} onValueChange={setSummaryType}>
                    <SelectTrigger className="w-[180px]" data-testid="select-summary-type">
                      <SelectValue placeholder="Summary type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brief">Brief Summary</SelectItem>
                      <SelectItem value="detailed">Detailed Summary</SelectItem>
                      <SelectItem value="handover">Handover Summary</SelectItem>
                      <SelectItem value="discharge">Discharge Instructions</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={() => summaryMutation.mutate()} disabled={summaryMutation.isPending} className="flex-1" data-testid="button-generate-summary">
                    {summaryMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate"
                    )}
                  </Button>
                </div>
                
                {generatedSummary && (
                  <div className="p-3 bg-background rounded border">
                    <div className="flex justify-end mb-2">
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(generatedSummary)} data-testid="button-copy-summary">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-summary">{generatedSummary}</p>
                  </div>
                )}
              </div>
            )}

            {/* Referral Letter Modal/Panel */}
            {showReferralModal && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4" data-testid="panel-referral">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Referrals</h4>
                  <Button variant="ghost" size="icon" onClick={() => setShowReferralModal(false)} data-testid="button-close-referral">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* AI Suggested Referrals */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium">Suggested Referrals</h5>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={fetchSuggestedReferrals}
                      disabled={isLoadingReferrals}
                    >
                      {isLoadingReferrals ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                  </div>
                  
                  {isLoadingReferrals ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Analyzing note...</span>
                    </div>
                  ) : suggestedReferrals.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No referrals suggested from this note</p>
                  ) : (
                    <div className="space-y-2">
                      {suggestedReferrals.map((ref, index) => (
                        <div key={index} className={`flex items-start gap-2 p-2 rounded border ${ref.confirmed ? 'bg-green-50 dark:bg-green-900/20 border-green-200' : 'bg-background'}`}>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{ref.specialty}</p>
                            <p className="text-xs text-muted-foreground">{ref.reason}</p>
                            <Badge variant={ref.urgency === 'urgent' || ref.urgency === 'emergent' ? 'destructive' : 'secondary'} className="text-xs mt-1">
                              {ref.urgency}
                            </Badge>
                          </div>
                          {ref.confirmed ? (
                            <Badge variant="default" className="bg-green-600">Letter Generated</Badge>
                          ) : (
                            <div className="flex gap-1">
                              <Button 
                                size="sm" 
                                variant="default"
                                onClick={() => confirmSuggestedReferral(ref, index)}
                                disabled={referralMutation.isPending}
                              >
                                <FileSignature className="h-3 w-3 mr-1" />
                                Generate
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => removeSuggestedReferral(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Manual Referral Entry */}
                <div className="border-t pt-4 space-y-3">
                  <h5 className="text-sm font-medium">Create Referral Letter Manually</h5>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Refer to Specialty</Label>
                      <Input
                        placeholder="e.g., Cardiology, Orthopedics"
                        value={referralSpecialty}
                        onChange={(e) => setReferralSpecialty(e.target.value)}
                        data-testid="input-referral-specialty"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Reason for Referral</Label>
                      <Input
                        placeholder="e.g., Further evaluation"
                        value={referralReason}
                        onChange={(e) => setReferralReason(e.target.value)}
                        data-testid="input-referral-reason"
                      />
                    </div>
                  </div>
                  
                  <Button onClick={() => referralMutation.mutate({})} disabled={referralMutation.isPending} className="w-full" data-testid="button-generate-referral">
                    {referralMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileSignature className="mr-2 h-4 w-4" />
                        Generate Referral Letter
                      </>
                    )}
                  </Button>
                </div>
                
                {referralLetter && (
                  <div className="p-3 bg-background rounded border">
                    <div className="flex justify-end mb-2 gap-2">
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(referralLetter)} data-testid="button-copy-referral">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setReferralLetter("")} data-testid="button-delete-referral">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      value={referralLetter}
                      onChange={(e) => setReferralLetter(e.target.value)}
                      className="min-h-[300px] text-sm"
                      data-testid="textarea-referral-letter"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Create Task Modal/Panel */}
            {showTaskModal && (
              <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-4" data-testid="panel-create-task">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Tasks for This Note</h4>
                  <Button variant="ghost" size="icon" onClick={() => setShowTaskModal(false)} data-testid="button-close-task-modal">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* AI Suggested Tasks */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-medium">Suggested Tasks</h5>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={fetchSuggestedTasks}
                      disabled={isLoadingSuggestedTasks}
                    >
                      {isLoadingSuggestedTasks ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    </Button>
                  </div>
                  
                  {isLoadingSuggestedTasks ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Analyzing note...</span>
                    </div>
                  ) : suggestedTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No tasks suggested from this note</p>
                  ) : (
                    <div className="space-y-2">
                      {suggestedTasks.map((task, index) => (
                        <div key={index} className={`flex items-start gap-2 p-2 rounded border ${task.confirmed ? 'bg-green-50 dark:bg-green-900/20 border-green-200' : 'bg-background'}`}>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="text-xs text-muted-foreground">{task.reason}</p>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className="text-xs">{task.category}</Badge>
                              <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'} className="text-xs">{task.priority}</Badge>
                            </div>
                          </div>
                          {task.confirmed ? (
                            <Badge variant="default" className="bg-green-600">Added</Badge>
                          ) : (
                            <div className="flex gap-1">
                              <Button 
                                size="sm" 
                                variant="default"
                                onClick={() => confirmSuggestedTask(task, index)}
                                disabled={createTaskMutation.isPending}
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => removeSuggestedTask(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Manual Task Entry */}
                <div className="border-t pt-4 space-y-3">
                  <h5 className="text-sm font-medium">Add Task Manually</h5>
                  <div className="space-y-2">
                    <Input
                      placeholder="e.g., Refer patient to GI for evaluation"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      data-testid="input-new-task-title"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Category</Label>
                      <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                        <SelectTrigger data-testid="select-new-task-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {TASK_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              <div className="flex items-center gap-2">
                                <cat.icon className="h-4 w-4" />
                                {cat.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date (optional)</Label>
                      <Input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
                        data-testid="input-new-task-due-date"
                      />
                    </div>
                  </div>
                  <Button 
                    onClick={handleCreateTask} 
                    disabled={!newTaskTitle.trim() || createTaskMutation.isPending} 
                    className="w-full" 
                    data-testid="button-submit-task"
                  >
                    {createTaskMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Task
                      </>
                    )}
                  </Button>
                </div>

                {noteTasks && noteTasks.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <h5 className="text-sm font-medium mb-2">Tasks linked to this note ({noteTasks.length})</h5>
                    <div className="space-y-2">
                      {noteTasks.slice(0, 3).map((task) => (
                        <div key={task.id} className="flex items-center gap-2 text-sm p-2 bg-background rounded">
                          <ListTodo className="h-4 w-4 text-muted-foreground" />
                          <span className={task.status === "completed" ? "line-through text-muted-foreground" : ""}>
                            {task.title}
                          </span>
                        </div>
                      ))}
                      {noteTasks.length > 3 && (
                        <Link href="/tasks" className="text-sm text-primary hover:underline">
                          View all {noteTasks.length} tasks
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {note.transcript && showTranscript && (
          <Card data-testid="card-transcript" className="mb-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AudioLines className="h-4 w-4 text-primary" />
                  Transcript
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => copyToClipboard(note.transcript || "")}
                  data-testid="button-copy-transcript"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-base whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>{note.transcript}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
