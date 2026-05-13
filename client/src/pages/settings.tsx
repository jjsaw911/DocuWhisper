import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, User, Stethoscope, Globe, FileText, Save, Bell, Clock, Users, Plus, Trash2, UserPlus, Crown, Shield, Copy, IdCard, Building2, Mic, MessageSquare, Upload, Database, Download } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { Template, UserSettings, Practice, PracticeMember, PersonalApiKey } from "@shared/schema";
import { EMR_ROLES, type EmrRoleType, PERSONAL_API_SCOPES } from "@shared/schema";
import {
  DEFAULT_TRANSCRIPTION_MODE,
  TRANSCRIPTION_MODES,
  getTranscriptionConfig,
  type TranscriptionMode,
} from "@/lib/transcription";
import { Key, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { isStaySignedInEnabled, setStaySignedInPreference } from "@/hooks/use-session-timeout";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
];

const SPECIALTIES = [
  "Primary Care",
  "Allergy",
  "Internal Medicine",
  "Family Medicine",
  "Cardiology",
  "Dermatology",
  "Emergency Medicine",
  "Endocrinology",
  "Gastroenterology",
  "Geriatrics",
  "Hematology",
  "Infectious Disease",
  "Nephrology",
  "Neurology",
  "Obstetrics & Gynecology",
  "Oncology",
  "Ophthalmology",
  "Orthopedics",
  "Otolaryngology (ENT)",
  "Pediatrics",
  "Physical Medicine",
  "Psychiatry",
  "Pulmonology",
  "Radiology",
  "Rheumatology",
  "Surgery",
  "Urology",
  "Other",
];

const NOTE_STYLES = [
  { value: "detailed", label: "Detailed - Comprehensive notes with full context" },
  { value: "concise", label: "Concise - Brief, to-the-point documentation" },
  { value: "bullet_points", label: "Bullet Points - Structured list format" },
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "zh", label: "Chinese" },
];

interface GlobalMedicalVocabulary {
  defaultTerms: string[];
  customTerms: string[];
  terms: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

interface MailboxDirectoryPreference {
  listInDirectory: boolean;
  updatedAt: string | null;
}

const MEDICAL_VOCABULARY_QUERY_KEY = ["/api/medical-vocabulary"] as const;

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [practiceName, setPracticeName] = useState("");
  const [language, setLanguage] = useState("en");
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>("");
  const [noteStyle, setNoteStyle] = useState("detailed");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [noiseThreshold, setNoiseThreshold] = useState(15);
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>(DEFAULT_TRANSCRIPTION_MODE);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [emailDigestTime, setEmailDigestTime] = useState("08:00");
  const [listInMailboxDirectory, setListInMailboxDirectory] = useState(true);
  const [staySignedIn, setStaySignedIn] = useState(false);
  const [internalMessageSubject, setInternalMessageSubject] = useState("");
  const [internalMessageCategory, setInternalMessageCategory] = useState("general");
  const [internalMessageBody, setInternalMessageBody] = useState("");
  const [newVocabularyTerm, setNewVocabularyTerm] = useState("");
  const [vocabularySearch, setVocabularySearch] = useState("");

  // EMR Credentials state
  const [emrRole, setEmrRole] = useState<string>("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseState, setLicenseState] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [npiNumber, setNpiNumber] = useState("");
  const [deaNumber, setDeaNumber] = useState("");
  const [deaExpiry, setDeaExpiry] = useState("");
  const [supervisingPhysicianId, setSupervisingPhysicianId] = useState("");
  const [credentials, setCredentials] = useState("");
  const [requiresCosignature, setRequiresCosignature] = useState(false);

  // Team/Practice management state
  const [newPracticeName, setNewPracticeName] = useState("");
  const [newPracticeDescription, setNewPracticeDescription] = useState("");
  const [createPracticeOpen, setCreatePracticeOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [selectedPractice, setSelectedPractice] = useState<{ practice: Practice; role: string } | null>(null);
  const [newMemberUserId, setNewMemberUserId] = useState("");

  // API Key management state
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(Object.keys(PERSONAL_API_SCOPES));
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: adminCheck } = useQuery<{ isAdmin: boolean }>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });

  const { data: globalVocabulary } = useQuery<GlobalMedicalVocabulary>({
    queryKey: MEDICAL_VOCABULARY_QUERY_KEY,
  });

  const { data: mailboxDirectoryPreference } = useQuery<MailboxDirectoryPreference>({
    queryKey: ["/api/mailbox/directory-preference"],
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  // Practices query
  const { data: practices = [], isLoading: practicesLoading } = useQuery<{ practice: Practice; role: string }[]>({
    queryKey: ["/api/practices"],
  });

  // Personal API keys query
  const { data: apiKeys = [], isLoading: apiKeysLoading } = useQuery<any[]>({
    queryKey: ["/api/personal-api-keys"],
    enabled: !!user && adminCheck?.isAdmin === true,
  });

  const showRestrictedSettings = adminCheck?.isAdmin === true;

  // Create practice mutation
  const createPracticeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/practices", {
        name: newPracticeName,
        description: newPracticeDescription || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/practices"] });
      setCreatePracticeOpen(false);
      setNewPracticeName("");
      setNewPracticeDescription("");
      toast({
        title: "Practice created",
        description: "Your new practice has been created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create practice",
        variant: "destructive",
      });
    },
  });

  // Delete practice mutation
  const deletePracticeMutation = useMutation({
    mutationFn: async (practiceId: number) => {
      await apiRequest("DELETE", `/api/practices/${practiceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/practices"] });
      toast({
        title: "Practice deleted",
        description: "The practice has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete practice",
        variant: "destructive",
      });
    },
  });

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/personal-api-keys", {
        name: newKeyName,
        scopes: newKeyScopes,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/personal-api-keys"] });
      setCreatedRawKey(data.rawKey);
      setShowKey(true);
      setNewKeyName("");
      setNewKeyScopes(Object.keys(PERSONAL_API_SCOPES));
      toast({
        title: "API key created",
        description: "Copy your key now - it won't be shown again",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      });
    },
  });

  // Revoke API key mutation
  const revokeApiKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      await apiRequest("POST", `/api/personal-api-keys/${keyId}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personal-api-keys"] });
      toast({
        title: "API key revoked",
        description: "The key can no longer be used",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to revoke API key",
        variant: "destructive",
      });
    },
  });

  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      await apiRequest("DELETE", `/api/personal-api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/personal-api-keys"] });
      toast({
        title: "API key deleted",
      });
    },
  });

  const downloadBackupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/backup/export", { credentials: "include" });
      if (!response.ok) {
        const message = (await response.text()) || "Failed to export backup data";
        throw new Error(message);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("content-disposition") || "";
      const filenameMatch = contentDisposition.match(/filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?/i);
      const filename = filenameMatch?.[1]
        ? decodeURIComponent(filenameMatch[1].trim())
        : `docuwhisper-backup-${new Date().toISOString().slice(0, 10)}.json`;

      return { blob, filename };
    },
    onSuccess: ({ blob, filename }) => {
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);

      toast({
        title: "Backup downloaded",
        description: "Scribe and EMR backup file downloaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Backup failed",
        description: error?.message || "Could not download backup data.",
        variant: "destructive",
      });
    },
  });

  const updateProfileImageMutation = useMutation({
    mutationFn: async (profileImageUrl: string | null) => {
      const response = await apiRequest("PUT", "/api/auth/profile-image", { profileImageUrl });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile photo updated",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update photo",
        description: "Please try another image",
        variant: "destructive",
      });
    },
  });

  const resizeImageFile = async (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const source = String(reader.result || "");
        const image = new Image();
        image.onload = () => {
          const maxSide = 512;
          const largestSide = Math.max(image.width, image.height);
          const scale = largestSide > maxSide ? maxSide / largestSide : 1;
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(source);
            return;
          }
          ctx.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        image.onerror = () => resolve(source);
        image.src = source;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const handleProfileImageSelected = async (event: any) => {
    const file = event?.target?.files?.[0] as File | undefined;
    if (!file) return;
    event.target.value = "";

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast({
        title: "Image too large",
        description: "Please choose an image under 8MB",
        variant: "destructive",
      });
      return;
    }

    try {
      const resized = await resizeImageFile(file);
      updateProfileImageMutation.mutate(resized);
    } catch {
      toast({
        title: "Failed to process image",
        description: "Please try a different file",
        variant: "destructive",
      });
    }
  };

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: async ({ practiceId, userId }: { practiceId: number; userId: string }) => {
      const response = await apiRequest("POST", `/api/practices/${practiceId}/members`, {
        userId,
        role: "member",
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/practices"] });
      setAddMemberOpen(false);
      setNewMemberUserId("");
      setSelectedPractice(null);
      toast({
        title: "Member added",
        description: "Team member has been added to the practice",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add team member",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (settings) {
      setFirstName(settings.firstName || "");
      setLastName(settings.lastName || "");
      setPreferredName(settings.preferredName || "");
      setSpecialty(settings.specialty || "");
      setPracticeName(settings.practiceName || "");
      setLanguage(settings.language || "en");
      setDefaultTemplateId(settings.defaultTemplateId?.toString() || "");
      setNoteStyle(settings.noteStyle || "detailed");
      setAutoSaveEnabled(settings.autoSaveEnabled ?? true);
      setShowTimestamps(settings.showTimestamps ?? true);
      setNoiseThreshold(settings.noiseThreshold ?? 15);
      const resolvedMode =
        settings.transcriptionMode && settings.transcriptionMode in TRANSCRIPTION_MODES
          ? (settings.transcriptionMode as TranscriptionMode)
          : DEFAULT_TRANSCRIPTION_MODE;
      setTranscriptionMode(resolvedMode);
      setEmailNotificationsEnabled(settings.emailNotificationsEnabled ?? false);
      setEmailDigestTime(settings.emailDigestTime || "08:00");
      // EMR Credentials
      setEmrRole(settings.emrRole || "");
      setLicenseNumber(settings.licenseNumber || "");
      setLicenseState(settings.licenseState || "");
      setLicenseExpiry(settings.licenseExpiry ? new Date(settings.licenseExpiry).toISOString().split('T')[0] : "");
      setNpiNumber(settings.npiNumber || "");
      setDeaNumber(settings.deaNumber || "");
      setDeaExpiry(settings.deaExpiry ? new Date(settings.deaExpiry).toISOString().split('T')[0] : "");
      setSupervisingPhysicianId(settings.supervisingPhysicianId || "");
      setCredentials(settings.credentials || "");
      setRequiresCosignature(settings.requiresCosignature || false);
    }
  }, [settings]);

  useEffect(() => {
    if (!mailboxDirectoryPreference) return;
    setListInMailboxDirectory(mailboxDirectoryPreference.listInDirectory);
  }, [mailboxDirectoryPreference]);

  useEffect(() => {
    setStaySignedIn(isStaySignedInEnabled());
  }, []);

  const normalizeVocabularyTerm = useCallback((value: string) => {
    return value.replace(/\s+/g, " ").trim();
  }, []);

  const sortVocabularyTerms = useCallback((terms: string[]) => {
    return [...terms].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );
  }, []);

  const mergeVocabularyTerms = useCallback(
    (existingTerms: string[], additionalTerms: string[]) => {
      const merged: string[] = [];
      const seen = new Set<string>();

      for (const term of [...existingTerms, ...additionalTerms]) {
        const normalized = normalizeVocabularyTerm(term);
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(normalized);
      }

      return sortVocabularyTerms(merged);
    },
    [normalizeVocabularyTerm, sortVocabularyTerms],
  );

  const persistVocabularyTerms = useCallback(async (customTerms: string[]) => {
    const response = await apiRequest("PUT", "/api/medical-vocabulary", {
      customTerms,
    });
    return response.json();
  }, []);

  const applyOptimisticVocabularyUpdate = useCallback(
    async (customTerms: string[]) => {
      await queryClient.cancelQueries({ queryKey: MEDICAL_VOCABULARY_QUERY_KEY });
      const previousVocabulary =
        queryClient.getQueryData<GlobalMedicalVocabulary>(MEDICAL_VOCABULARY_QUERY_KEY);

      queryClient.setQueryData<GlobalMedicalVocabulary>(
        MEDICAL_VOCABULARY_QUERY_KEY,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            customTerms,
            terms: mergeVocabularyTerms(current.defaultTerms, customTerms),
            updatedAt: new Date().toISOString(),
          };
        },
      );

      return previousVocabulary;
    },
    [mergeVocabularyTerms, queryClient],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/settings", {
        firstName: firstName || null,
        lastName: lastName || null,
        preferredName: preferredName || null,
        specialty: specialty || null,
        practiceName: practiceName || null,
        language,
        defaultTemplateId: defaultTemplateId ? parseInt(defaultTemplateId) : null,
        noteStyle,
        autoSaveEnabled,
        showTimestamps,
        transcriptionMode,
        noiseThreshold,
        emailNotificationsEnabled,
        emailDigestTime,
        ...(showRestrictedSettings
          ? {
              emrRole: emrRole || null,
              licenseNumber: licenseNumber || null,
              licenseState: licenseState || null,
              licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : null,
              npiNumber: npiNumber || null,
              deaNumber: deaNumber || null,
              deaExpiry: deaExpiry ? new Date(deaExpiry) : null,
              supervisingPhysicianId: supervisingPhysicianId || null,
              credentials: credentials || null,
              requiresCosignature,
            }
          : {}),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  const addVocabularyMutation = useMutation({
    mutationFn: async ({ nextCustomTerms }: { nextCustomTerms: string[]; term: string }) =>
      persistVocabularyTerms(nextCustomTerms),
    onMutate: async ({
      nextCustomTerms,
      term,
    }: {
      nextCustomTerms: string[];
      term: string;
    }) => {
      const previousVocabulary = await applyOptimisticVocabularyUpdate(nextCustomTerms);
      setNewVocabularyTerm("");
      return { previousVocabulary, term };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(MEDICAL_VOCABULARY_QUERY_KEY, data);
      toast({
        title: "Shared term added",
        description: "The term was added to the shared vocabulary.",
      });
    },
    onError: (_error, _variables, context: any) => {
      if (context?.previousVocabulary) {
        queryClient.setQueryData(MEDICAL_VOCABULARY_QUERY_KEY, context.previousVocabulary);
      }
      if (context?.term) {
        setNewVocabularyTerm(context.term);
      }
      toast({
        title: "Error",
        description: "Failed to add the shared term",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: MEDICAL_VOCABULARY_QUERY_KEY });
    },
  });

  const saveMailboxDirectoryPreferenceMutation = useMutation({
    mutationFn: async (listInDirectory: boolean) => {
      const response = await apiRequest("PUT", "/api/mailbox/directory-preference", {
        listInDirectory,
      });
      return response.json();
    },
    onSuccess: (data: MailboxDirectoryPreference) => {
      queryClient.invalidateQueries({ queryKey: ["/api/mailbox/directory-preference"] });
      setListInMailboxDirectory(data.listInDirectory);
      toast({
        title: "Mailbox directory updated",
        description: data.listInDirectory
          ? "Your profile is visible in recipient lookup."
          : "You are now hidden from recipient lookup results.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update mailbox directory preference",
        variant: "destructive",
      });
    },
  });

  const sortedVocabularyTerms = useMemo(() => {
    return sortVocabularyTerms(globalVocabulary?.terms || []);
  }, [globalVocabulary?.terms, sortVocabularyTerms]);

  const filteredVocabularyTerms = useMemo(() => {
    const query = vocabularySearch.trim().toLowerCase();
    if (!query) return sortedVocabularyTerms.slice(0, 200);
    return sortedVocabularyTerms
      .filter((term) => term.toLowerCase().includes(query))
      .slice(0, 200);
  }, [sortedVocabularyTerms, vocabularySearch]);

  const isVocabularyUpdating = addVocabularyMutation.isPending;

  const handleAddVocabularyTerm = useCallback(() => {
    const nextTerm = normalizeVocabularyTerm(newVocabularyTerm);
    if (!nextTerm) return;

    const existingCustomTerms = globalVocabulary?.customTerms || [];
    const hasCustomTerm = existingCustomTerms.some(
      (term) => term.toLowerCase() === nextTerm.toLowerCase(),
    );
    const hasGlobalTerm = (globalVocabulary?.defaultTerms || []).some(
      (term) => term.toLowerCase() === nextTerm.toLowerCase(),
    );

    if (hasCustomTerm || hasGlobalTerm) {
      setNewVocabularyTerm("");
      toast({
        title: "Term already listed",
        description: "That term is already in the shared vocabulary list.",
      });
      return;
    }

    addVocabularyMutation.mutate({
      term: nextTerm,
      nextCustomTerms: mergeVocabularyTerms(existingCustomTerms, [nextTerm]),
    });
  }, [
    addVocabularyMutation,
    globalVocabulary?.customTerms,
    globalVocabulary?.defaultTerms,
    mergeVocabularyTerms,
    newVocabularyTerm,
    normalizeVocabularyTerm,
    toast,
  ]);

  const sendInternalMessageMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/internal-messages", {
        subject: internalMessageSubject.trim(),
        category: internalMessageCategory,
        message: internalMessageBody.trim(),
      });
      return response.json();
    },
    onSuccess: () => {
      setInternalMessageSubject("");
      setInternalMessageBody("");
      setInternalMessageCategory("general");
      toast({
        title: "Message sent",
        description: "Your message is now in the internal admin inbox.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send",
        description: error?.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const currentTranscriptionConfig = getTranscriptionConfig(transcriptionMode);

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b bg-background/95 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-muted-foreground">Manage your profile and preferences</p>
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                <CardTitle>Profile</CardTitle>
              </div>
              <CardDescription>Your personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 mb-6">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.email || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xl">
                    {firstName?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-1">
                  <p className="font-medium">{user?.email}</p>
                  <p className="text-sm text-muted-foreground">Account email</p>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="bg-muted px-2 py-1 rounded text-xs font-mono" data-testid="text-user-id">
                      {user?.id}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => {
                        if (user?.id) {
                          navigator.clipboard.writeText(user.id);
                          toast({ title: "User ID copied" });
                        }
                      }}
                      data-testid="button-copy-user-id"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Your User ID</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <input
                      ref={profileImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleProfileImageSelected}
                      data-testid="input-profile-photo-file"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => profileImageInputRef.current?.click()}
                      disabled={updateProfileImageMutation.isPending}
                      data-testid="button-upload-profile-photo"
                    >
                      {updateProfileImageMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-1" />
                      )}
                      Upload photo
                    </Button>
                    {user?.profileImageUrl && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => updateProfileImageMutation.mutate(null)}
                        disabled={updateProfileImageMutation.isPending}
                        data-testid="button-remove-profile-photo"
                      >
                        Remove photo
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="preferredName">Preferred Name (displayed in sidebar)</Label>
                <Input
                  id="preferredName"
                  value={preferredName}
                  onChange={(e) => setPreferredName(e.target.value)}
                  placeholder="How you'd like to be called"
                  data-testid="input-preferred-name"
                />
                <p className="text-xs text-muted-foreground">
                  This name will be shown in the sidebar. Leave blank to use your first name.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter first name"
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter last name"
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="practiceName">Practice / Organization Name</Label>
                <Input
                  id="practiceName"
                  value={practiceName}
                  onChange={(e) => setPracticeName(e.target.value)}
                  placeholder="e.g., City Medical Center"
                  data-testid="input-practice-name"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-primary" />
                <CardTitle>Clinical Settings</CardTitle>
              </div>
              <CardDescription>Customize your documentation preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="specialty">Medical Specialty</Label>
                <Select value={specialty} onValueChange={setSpecialty}>
                  <SelectTrigger data-testid="select-specialty">
                    <SelectValue placeholder="Select your specialty" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIALTIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="noteStyle">Note Style</Label>
                <Select value={noteStyle} onValueChange={setNoteStyle}>
                  <SelectTrigger data-testid="select-note-style">
                    <SelectValue placeholder="Select note style" />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_STYLES.map((style) => (
                      <SelectItem key={style.value} value={style.value}>
                        {style.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This affects how AI generates your SOAP notes
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultTemplate">Default Template</Label>
                <Select value={defaultTemplateId || "none"} onValueChange={(val) => setDefaultTemplateId(val === "none" ? "" : val)}>
                  <SelectTrigger data-testid="select-default-template">
                    <SelectValue placeholder="Select default template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (use system default)</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Automatically selected when starting new sessions
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <CardTitle>Language & Region</CardTitle>
              </div>
              <CardDescription>Set your language preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="language">Preferred Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger data-testid="select-language">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used for transcription and note generation
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>Recording Preferences</CardTitle>
              </div>
              <CardDescription>Configure how recordings are processed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="autoSave">Auto-save Notes</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically save notes after transcription completes
                  </p>
                </div>
                <Switch
                  id="autoSave"
                  checked={autoSaveEnabled}
                  onCheckedChange={setAutoSaveEnabled}
                  data-testid="switch-auto-save"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="timestamps">Show Timestamps</Label>
                  <p className="text-sm text-muted-foreground">
                    Display recording time markers in transcripts
                  </p>
                </div>
                <Switch
                  id="timestamps"
                  checked={showTimestamps}
                  onCheckedChange={setShowTimestamps}
                  data-testid="switch-timestamps"
                />
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="transcriptionMode">Transcription Style</Label>
                <Select
                  value={transcriptionMode}
                  onValueChange={(value) => setTranscriptionMode(value as TranscriptionMode)}
                >
                  <SelectTrigger id="transcriptionMode" data-testid="select-transcription-mode">
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRANSCRIPTION_MODES).map(([value, config]) => (
                      <SelectItem key={value} value={value}>
                        {config.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {currentTranscriptionConfig.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  Chunks: {currentTranscriptionConfig.minSec}–{currentTranscriptionConfig.maxSec}s ·
                  Silence flush: ~{currentTranscriptionConfig.silenceSec}s
                </p>
              </div>
              
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="noiseThreshold">Microphone Sensitivity</Label>
                </div>
                <div className="space-y-2">
                  <Slider
                    id="noiseThreshold"
                    min={0}
                    max={50}
                    step={5}
                    value={[noiseThreshold]}
                    onValueChange={(value) => setNoiseThreshold(value[0])}
                    data-testid="slider-noise-threshold"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>More Sensitive</span>
                    <span>Current: {noiseThreshold}%</span>
                    <span>Less Sensitive</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Higher values filter out more background noise but may miss quiet speech. 
                    Lower values are more sensitive but may pick up ambient sounds.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-primary" />
                <CardTitle>Shared Medical Vocabulary</CardTitle>
              </div>
              <CardDescription>
                One shared spelling dictionary used for transcription and note generation across every user.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
                <p>Total terms available: <span className="font-medium text-foreground">{globalVocabulary?.terms?.length || 0}</span></p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-vocabulary-term">Add Shared Term</Label>
                <div className="flex gap-2">
                  <Input
                    id="new-vocabulary-term"
                    value={newVocabularyTerm}
                    onChange={(e) => setNewVocabularyTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddVocabularyTerm();
                      }
                    }}
                    placeholder="Type a term and add it to the shared word database"
                    data-testid="input-add-vocabulary-term"
                  />
                  <Button
                    type="button"
                    onClick={handleAddVocabularyTerm}
                    disabled={isVocabularyUpdating || !normalizeVocabularyTerm(newVocabularyTerm)}
                    data-testid="button-add-vocabulary-term"
                  >
                    {addVocabularyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Any user can add a term. It is saved to the shared vocabulary and the add box clears after save.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t">
                <Label htmlFor="vocabulary-search">Browse Total Available Terms</Label>
                <Input
                  id="vocabulary-search"
                  value={vocabularySearch}
                  onChange={(e) => setVocabularySearch(e.target.value)}
                  placeholder="Search terms (drug, biologic, specialty, terminology...)"
                  data-testid="input-vocabulary-search"
                />
                <div className="max-h-48 overflow-auto rounded-md border bg-muted/10 p-2">
                  {filteredVocabularyTerms.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No matching terms.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {filteredVocabularyTerms.map((term) => (
                        <Badge key={term} variant="outline" className="text-[10px]">
                          {term}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Showing up to 200 terms. Refine search to find specific entries.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-primary" />
                <CardTitle>Live Transcription FAQ</CardTitle>
              </div>
              <CardDescription>How audio is chunked and why delays happen</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                <li>Audio is buffered and sent in blobs, not streamed continuously.</li>
                <li>A blob is sent when it hits a size/time limit, silence is detected, or you pause/stop.</li>
                <li>Short delays are normal, and you may see a burst of text after a sentence finishes.</li>
                <li>If audio is very quiet or the mic drops, a blob may not send until silence flushes.</li>
                <li>Switching tabs or audio devices can interrupt delivery; keep the mic active.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle>Session Security</CardTitle>
              </div>
              <CardDescription>Control automatic sign-out behavior on this device</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="staySignedIn">Stay signed in on this device</Label>
                  <p className="text-sm text-muted-foreground">
                    Disables inactivity auto-logout. Use only on a private trusted device.
                  </p>
                </div>
                <Switch
                  id="staySignedIn"
                  checked={staySignedIn}
                  onCheckedChange={(checked) => {
                    setStaySignedIn(checked);
                    setStaySignedInPreference(checked);
                    toast({
                      title: checked ? "Stay signed in enabled" : "Stay signed in disabled",
                      description: checked
                        ? "You will remain signed in unless you manually log out."
                        : "Inactivity auto-logout is active again (30 minutes).",
                    });
                  }}
                  data-testid="switch-stay-signed-in"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle>Data Backup</CardTitle>
              </div>
              <CardDescription>Export your Scribe and EMR data into a downloadable JSON file.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Includes notes, templates, tasks, patients, appointments, encounters, vitals, documents, and linked notes.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadBackupMutation.mutate()}
                disabled={downloadBackupMutation.isPending}
                data-testid="button-download-backup"
              >
                {downloadBackupMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Download Backup
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                <CardTitle>Email Notifications</CardTitle>
              </div>
              <CardDescription>Configure your daily task digest emails</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="emailNotifications">Daily Task Digest</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive a daily email summary of your pending tasks
                  </p>
                </div>
                <Switch
                  id="emailNotifications"
                  checked={emailNotificationsEnabled}
                  onCheckedChange={setEmailNotificationsEnabled}
                  data-testid="switch-email-notifications"
                />
              </div>

              {emailNotificationsEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="digestTime">Delivery Time</Label>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Input
                      id="digestTime"
                      type="time"
                      value={emailDigestTime}
                      onChange={(e) => setEmailDigestTime(e.target.value)}
                      className="w-32"
                      data-testid="input-digest-time"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Choose when you'd like to receive your daily task summary
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <CardTitle>Mailbox Directory</CardTitle>
              </div>
              <CardDescription>
                Control whether your account appears in mailbox recipient lookup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="mailbox-directory-visible">List me in recipient lookup</Label>
                  <p className="text-sm text-muted-foreground">
                    If disabled, your account is hidden from directory search results.
                  </p>
                </div>
                <Switch
                  id="mailbox-directory-visible"
                  checked={listInMailboxDirectory}
                  onCheckedChange={(checked) => setListInMailboxDirectory(checked)}
                  data-testid="switch-mailbox-directory-visible"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => saveMailboxDirectoryPreferenceMutation.mutate(listInMailboxDirectory)}
                  disabled={saveMailboxDirectoryPreferenceMutation.isPending}
                  data-testid="button-save-mailbox-directory-preference"
                >
                  {saveMailboxDirectoryPreferenceMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Save Mailbox Preference
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <CardTitle>Contact Admin</CardTitle>
              </div>
              <CardDescription>
                Send an internal message to your admin inbox without external email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="internal-message-subject">Subject</Label>
                <Input
                  id="internal-message-subject"
                  value={internalMessageSubject}
                  onChange={(e) => setInternalMessageSubject(e.target.value)}
                  placeholder="What do you need help with?"
                  data-testid="input-internal-message-subject"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal-message-category">Category</Label>
                <Select value={internalMessageCategory} onValueChange={setInternalMessageCategory}>
                  <SelectTrigger id="internal-message-category" data-testid="select-internal-message-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="bug">Bug Report</SelectItem>
                    <SelectItem value="feature">Feature Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal-message-body">Message</Label>
                <Textarea
                  id="internal-message-body"
                  value={internalMessageBody}
                  onChange={(e) => setInternalMessageBody(e.target.value)}
                  placeholder="Describe your request or issue..."
                  className="min-h-[140px]"
                  data-testid="textarea-internal-message-body"
                />
              </div>
              <Button
                onClick={() => sendInternalMessageMutation.mutate()}
                disabled={!internalMessageSubject.trim() || !internalMessageBody.trim() || sendInternalMessageMutation.isPending}
                data-testid="button-send-internal-message"
              >
                {sendInternalMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Send to Admin Inbox
              </Button>
            </CardContent>
          </Card>

          {showRestrictedSettings && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <IdCard className="h-5 w-5 text-primary" />
                  <CardTitle>EMR Credentials</CardTitle>
                </div>
                <CardDescription>Professional credentials for EMR access and documentation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emrRole">Role / Position</Label>
                <Select value={emrRole} onValueChange={setEmrRole}>
                  <SelectTrigger id="emrRole" data-testid="select-emr-role">
                    <SelectValue placeholder="Select your role..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EMR_ROLES).map(([key, role]) => (
                      <SelectItem key={key} value={key}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Your role determines permissions within the EMR system
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="credentials">Credentials Suffix</Label>
                <Input
                  id="credentials"
                  value={credentials}
                  onChange={(e) => setCredentials(e.target.value)}
                  placeholder="e.g., MD, FACP or NP, MSN"
                  data-testid="input-credentials"
                />
                <p className="text-xs text-muted-foreground">
                  Professional credentials displayed after your name
                </p>
              </div>

              {(emrRole === 'physician' || emrRole === 'mid_level') && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="licenseNumber">License Number</Label>
                      <Input
                        id="licenseNumber"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        placeholder="State medical license #"
                        data-testid="input-license-number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="licenseState">License State</Label>
                      <Select value={licenseState} onValueChange={setLicenseState}>
                        <SelectTrigger id="licenseState" data-testid="select-license-state">
                          <SelectValue placeholder="State" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="licenseExpiry">License Expiration</Label>
                    <Input
                      id="licenseExpiry"
                      type="date"
                      value={licenseExpiry}
                      onChange={(e) => setLicenseExpiry(e.target.value)}
                      data-testid="input-license-expiry"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="npiNumber">NPI Number</Label>
                    <Input
                      id="npiNumber"
                      value={npiNumber}
                      onChange={(e) => setNpiNumber(e.target.value)}
                      placeholder="10-digit National Provider Identifier"
                      maxLength={10}
                      data-testid="input-npi-number"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="deaNumber">DEA Number</Label>
                      <Input
                        id="deaNumber"
                        value={deaNumber}
                        onChange={(e) => setDeaNumber(e.target.value)}
                        placeholder="For controlled substances"
                        data-testid="input-dea-number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deaExpiry">DEA Expiration</Label>
                      <Input
                        id="deaExpiry"
                        type="date"
                        value={deaExpiry}
                        onChange={(e) => setDeaExpiry(e.target.value)}
                        data-testid="input-dea-expiry"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Co-signature Toggle - Available for all clinical roles */}
              {emrRole && (
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-1">
                    <Label htmlFor="requiresCosignature" className="text-sm font-medium">
                      Require Physician Co-signature
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Enable if your state requires supervising physician to co-sign your encounters
                    </p>
                  </div>
                  <Switch
                    id="requiresCosignature"
                    checked={requiresCosignature}
                    onCheckedChange={setRequiresCosignature}
                    data-testid="switch-requires-cosignature"
                  />
                </div>
              )}

              {requiresCosignature && (
                <div className="space-y-2">
                  <Label htmlFor="supervisingPhysicianId">Supervising Physician ID</Label>
                  <Input
                    id="supervisingPhysicianId"
                    value={supervisingPhysicianId}
                    onChange={(e) => setSupervisingPhysicianId(e.target.value)}
                    placeholder="User ID of supervising MD/DO"
                    data-testid="input-supervising-physician"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your encounters will require co-signature from this physician
                  </p>
                </div>
              )}

              {emrRole && EMR_ROLES[emrRole as EmrRoleType] && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-2">
                  <p className="text-sm font-medium">Role Permissions:</p>
                  <div className="flex flex-wrap gap-2">
                    {EMR_ROLES[emrRole as EmrRoleType].canViewPatients && (
                      <Badge variant="secondary">View Patients</Badge>
                    )}
                    {EMR_ROLES[emrRole as EmrRoleType].canEditPatients && (
                      <Badge variant="secondary">Edit Patients</Badge>
                    )}
                    {EMR_ROLES[emrRole as EmrRoleType].canCreateEncounters && (
                      <Badge variant="secondary">Create Encounters</Badge>
                    )}
                    {EMR_ROLES[emrRole as EmrRoleType].canSignEncounters && (
                      <Badge variant="secondary">Sign Encounters</Badge>
                    )}
                    {EMR_ROLES[emrRole as EmrRoleType].canCosignEncounters && (
                      <Badge variant="secondary">Co-sign Encounters</Badge>
                    )}
                    {EMR_ROLES[emrRole as EmrRoleType].canPrescribe && (
                      <Badge variant="secondary">Prescribe</Badge>
                    )}
                    {EMR_ROLES[emrRole as EmrRoleType].canViewSchedule && (
                      <Badge variant="secondary">View Schedule</Badge>
                    )}
                    {EMR_ROLES[emrRole as EmrRoleType].canViewBilling && (
                      <Badge variant="secondary">View Billing</Badge>
                    )}
                    {EMR_ROLES[emrRole as EmrRoleType].canManageTeam && (
                      <Badge variant="secondary">Manage Team</Badge>
                    )}
                  </div>
                </div>
              )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle>Team & Practices</CardTitle>
                </div>
                <Dialog open={createPracticeOpen} onOpenChange={setCreatePracticeOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-create-practice">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Practice
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Practice</DialogTitle>
                      <DialogDescription>
                        Create a practice to collaborate with your team members and share notes.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="practiceName">Practice Name</Label>
                        <Input
                          id="practiceName"
                          value={newPracticeName}
                          onChange={(e) => setNewPracticeName(e.target.value)}
                          placeholder="e.g., City Medical Center"
                          data-testid="input-new-practice-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="practiceDescription">Description (optional)</Label>
                        <Textarea
                          id="practiceDescription"
                          value={newPracticeDescription}
                          onChange={(e) => setNewPracticeDescription(e.target.value)}
                          placeholder="Brief description of your practice"
                          data-testid="input-practice-description"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setCreatePracticeOpen(false)}
                        data-testid="button-cancel-practice"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => createPracticeMutation.mutate()}
                        disabled={!newPracticeName.trim() || createPracticeMutation.isPending}
                        data-testid="button-confirm-create-practice"
                      >
                        {createPracticeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Create Practice
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <CardDescription>Manage your practices and team collaboration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {practicesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : practices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No practices yet</p>
                  <p className="text-sm">Create a practice to start collaborating with your team</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {practices.map(({ practice, role }) => (
                    <div
                      key={practice.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`practice-item-${practice.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{practice.name}</p>
                            <Badge variant={role === "owner" ? "default" : role === "admin" ? "secondary" : "outline"}>
                              {role === "owner" && <Crown className="h-3 w-3 mr-1" />}
                              {role === "admin" && <Shield className="h-3 w-3 mr-1" />}
                              {role}
                            </Badge>
                          </div>
                          {practice.description && (
                            <p className="text-sm text-muted-foreground">{practice.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(role === "owner" || role === "admin") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedPractice({ practice, role });
                              setAddMemberOpen(true);
                            }}
                            data-testid={`button-add-member-${practice.id}`}
                          >
                            <UserPlus className="h-4 w-4 mr-2" />
                            Add Member
                          </Button>
                        )}
                        {role === "owner" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this practice? All shared notes will be unshared.")) {
                                deletePracticeMutation.mutate(practice.id);
                              }
                            }}
                            data-testid={`button-delete-practice-${practice.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {showRestrictedSettings && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Keys
                </CardTitle>
                <CardDescription>
                  Generate API keys to connect mobile apps or other integrations to your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  Base URL: <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/mobile</code>
                </p>
                <Dialog open={createKeyOpen} onOpenChange={(open) => {
                  setCreateKeyOpen(open);
                  if (!open) {
                    setCreatedRawKey(null);
                    setShowKey(false);
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-create-api-key">
                      <Plus className="h-4 w-4 mr-2" />
                      Create API Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>{createdRawKey ? "API Key Created" : "Create API Key"}</DialogTitle>
                      <DialogDescription>
                        {createdRawKey 
                          ? "Copy your key now. It won't be shown again."
                          : "Create a new API key for your mobile app or integration"}
                      </DialogDescription>
                    </DialogHeader>

                    {createdRawKey ? (
                      <div className="space-y-4 py-4">
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-2">
                            <code className="text-xs flex-1 break-all font-mono" data-testid="text-raw-api-key">
                              {showKey ? createdRawKey : createdRawKey.substring(0, 12) + "•".repeat(40)}
                            </code>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setShowKey(!showKey)}
                              data-testid="button-toggle-key-visibility"
                            >
                              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard.writeText(createdRawKey);
                                toast({ title: "Copied to clipboard" });
                              }}
                              data-testid="button-copy-api-key"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-destructive font-medium">
                          Store this key securely. You won't be able to see it again after closing this dialog.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="keyName">Key Name</Label>
                          <Input
                            id="keyName"
                            value={newKeyName}
                            onChange={(e) => setNewKeyName(e.target.value)}
                            placeholder="e.g., iPhone App, iPad Pro"
                            data-testid="input-api-key-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Permissions</Label>
                          <div className="grid grid-cols-1 gap-2">
                            {Object.entries(PERSONAL_API_SCOPES).map(([scope, description]) => (
                              <label key={scope} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={newKeyScopes.includes(scope)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setNewKeyScopes([...newKeyScopes, scope]);
                                    } else {
                                      setNewKeyScopes(newKeyScopes.filter(s => s !== scope));
                                    }
                                  }}
                                  data-testid={`checkbox-scope-${scope}`}
                                />
                                <span className="font-mono text-xs text-muted-foreground">{scope}</span>
                                <span>{description}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <DialogFooter>
                      {createdRawKey ? (
                        <Button onClick={() => {
                          setCreateKeyOpen(false);
                          setCreatedRawKey(null);
                          setShowKey(false);
                        }} data-testid="button-done-api-key">
                          Done
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" onClick={() => setCreateKeyOpen(false)}>
                            Cancel
                          </Button>
                          <Button
                            onClick={() => createApiKeyMutation.mutate()}
                            disabled={!newKeyName.trim() || newKeyScopes.length === 0 || createApiKeyMutation.isPending}
                            data-testid="button-confirm-create-key"
                          >
                            {createApiKeyMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Create Key
                          </Button>
                        </>
                      )}
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {apiKeysLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No API keys yet</p>
                  <p className="text-xs">Create one to connect your mobile app</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {apiKeys.map((key: any) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between gap-2 p-3 border rounded-lg flex-wrap"
                      data-testid={`api-key-item-${key.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{key.name}</p>
                          <Badge variant={key.status === "active" ? "default" : "secondary"}>
                            {key.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span className="font-mono">{key.keyPrefix}•••</span>
                          <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                          {key.lastUsedAt && (
                            <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {key.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Revoke this API key? Any app using it will stop working.")) {
                                revokeApiKeyMutation.mutate(key.id);
                              }
                            }}
                            data-testid={`button-revoke-key-${key.id}`}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Revoke
                          </Button>
                        )}
                        {key.status === "revoked" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteApiKeyMutation.mutate(key.id)}
                            data-testid={`button-delete-key-${key.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </CardContent>
            </Card>
          )}

          {/* Add Member Dialog */}
          <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
                <DialogDescription>
                  Add a member to {selectedPractice?.practice.name} by entering their user ID.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="memberId">User ID</Label>
                  <Input
                    id="memberId"
                    value={newMemberUserId}
                    onChange={(e) => setNewMemberUserId(e.target.value)}
                    placeholder="Enter user ID"
                    data-testid="input-new-member-id"
                  />
                  <p className="text-xs text-muted-foreground">
                    Ask your team member for their user ID from their profile settings
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddMemberOpen(false);
                    setNewMemberUserId("");
                    setSelectedPractice(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedPractice && newMemberUserId.trim()) {
                      addMemberMutation.mutate({
                        practiceId: selectedPractice.practice.id,
                        userId: newMemberUserId.trim(),
                      });
                    }
                  }}
                  disabled={!newMemberUserId.trim() || addMemberMutation.isPending}
                  data-testid="button-confirm-add-member"
                >
                  {addMemberMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Add Member
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
