import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { rosOptions, peOptions, icd10Codes, cptCodes, medicationDatabase } from "@/lib/clinical-data";
import type { DiagnosisCode, ProcedureCode, MedicationEntry, RosChecklist, PeChecklist } from "@/lib/clinical-data";
import { ClinicalAutocomplete, MedicationAutocomplete } from "@/components/clinical-autocomplete";
import { ClinicalChecklist, ChecklistSummary } from "@/components/clinical-checklist";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { EmrConsentDialog } from "@/components/emr-consent-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Save,
  Trash2,
  User,
  Phone,
  Mail,
  Calendar,
  FileText,
  CalendarDays,
  Shield,
  AlertCircle,
  Pill,
  Heart,
  Activity,
  Stethoscope,
  Plus,
  Thermometer,
  Weight,
  Ruler,
  Droplet,
  Clock,
  ClipboardList,
  Loader2,
  Eye,
  Edit,
  Brain,
  Ear,
  Bone,
  PersonStanding,
  X,
  Check,
  PenLine,
  Unlock,
} from "lucide-react";
import type { Patient, Note, Appointment, PatientVitals, PatientEncounter } from "@shared/schema";
import PatientOverview from "@/components/emr/patient-overview";
import { StructuredAllergyInput } from "@/components/emr/structured-allergy-input";
import { StructuredMedicationInput } from "@/components/emr/structured-medication-input";
import EncounterDialogs, { encounterFormSchema } from "@/components/emr/encounter-dialogs";
import type { EncounterFormData } from "@/components/emr/encounter-dialogs";

const updatePatientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional().nullable(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  insuranceProvider: z.string().optional(),
  insurancePolicyNumber: z.string().optional(),
  medicalHistory: z.string().optional(),
  allergies: z.string().optional(),
  medications: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  isActive: z.boolean().optional(),
});

type UpdatePatientFormData = z.infer<typeof updatePatientSchema>;

const vitalsInputSchema = z.object({
  bloodPressureSystolic: z.string().optional(),
  bloodPressureDiastolic: z.string().optional(),
  heartRate: z.string().optional(),
  respiratoryRate: z.string().optional(),
  temperature: z.string().optional(),
  temperatureUnit: z.enum(["F", "C"]).default("F"),
  oxygenSaturation: z.string().optional(),
  weight: z.string().optional(),
  weightUnit: z.enum(["lbs", "kg"]).default("lbs"),
  height: z.string().optional(),
  heightUnit: z.enum(["in", "cm"]).default("in"),
  painLevel: z.string().optional(),
  painLocation: z.string().optional(),
  bloodGlucose: z.string().optional(),
  notes: z.string().optional(),
});

type VitalsFormData = z.infer<typeof vitalsInputSchema>;

const PATIENT_DETAIL_TABS = [
  "overview",
  "demographics",
  "vitals",
  "encounters",
  "medical",
  "notes",
  "appointments",
] as const;

type PatientDetailTab = (typeof PATIENT_DETAIL_TABS)[number];

const DEFAULT_PATIENT_DETAIL_TAB: PatientDetailTab = "overview";
const PATIENT_DETAIL_TAB_SET = new Set<string>(PATIENT_DETAIL_TABS);
const UNSAVED_PATIENT_CHANGES_MESSAGE =
  "You have unsaved patient changes. Leave without saving?";
const UNSAVED_NEW_ENCOUNTER_MESSAGE =
  "You have an unsaved new encounter. Discard changes?";
const UNSAVED_EDIT_ENCOUNTER_MESSAGE =
  "You have unsaved encounter edits. Discard changes?";

const resolvePatientDetailTab = (search: string): PatientDetailTab => {
  const tab = new URLSearchParams(search).get("tab");
  if (tab && PATIENT_DETAIL_TAB_SET.has(tab)) {
    return tab as PatientDetailTab;
  }
  return DEFAULT_PATIENT_DETAIL_TAB;
};

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const patientId = parseInt(id || "0");
  const [activeTab, setActiveTab] = useState<PatientDetailTab>(() =>
    resolvePatientDetailTab(window.location.search)
  );
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showVitalsForm, setShowVitalsForm] = useState(false);
  const [showEncounterDialog, setShowEncounterDialog] = useState(false);
  const [viewingEncounter, setViewingEncounter] = useState<PatientEncounter | null>(null);
  const [editingEncounter, setEditingEncounter] = useState<PatientEncounter | null>(null);
  
  // Clinical data state
  const [rosChecklist, setRosChecklist] = useState<RosChecklist>({});
  const [peChecklist, setPeChecklist] = useState<PeChecklist>({});
  const [diagnosisCodes, setDiagnosisCodes] = useState<DiagnosisCode[]>([]);
  const [procedureCodes, setProcedureCodes] = useState<ProcedureCode[]>([]);
  const [medications, setMedications] = useState<MedicationEntry[]>([]);

  const { data: emrAccess, isLoading: isCheckingAccess } = useQuery<{ 
    hasAccess: boolean;
    consentAcknowledged: boolean;
  }>({
    queryKey: ["/api/emr/access"],
  });

  useEffect(() => {
    if (!isCheckingAccess && emrAccess && !emrAccess.hasAccess) {
      toast({
        title: "Access Denied",
        description: "You don't have access to the EMR system. Please contact your administrator.",
        variant: "destructive",
      });
      navigate("/");
    }
    if (!isCheckingAccess && emrAccess?.hasAccess && !emrAccess.consentAcknowledged) {
      setShowConsentDialog(true);
    }
  }, [emrAccess, isCheckingAccess, navigate, toast]);

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ["/api/emr/patients", patientId],
    enabled: !!patientId && emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true,
  });

  const { data: patientNotes = [] } = useQuery<Note[]>({
    queryKey: ["/api/emr/patients", patientId, "notes"],
    enabled: !!patientId && emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true,
  });

  const { data: patientAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/emr/patients", patientId, "appointments"],
    enabled: !!patientId && emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true,
  });

  const { data: patientVitals = [] } = useQuery<PatientVitals[]>({
    queryKey: ["/api/emr/patients", patientId, "vitals"],
    enabled: !!patientId && emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true,
  });

  const { data: patientEncounters = [] } = useQuery<PatientEncounter[]>({
    queryKey: ["/api/emr/patients", patientId, "encounters"],
    enabled: !!patientId && emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true,
  });

  // Get user settings to determine role and co-sign ability
  const { data: userSettings } = useQuery<{
    emrRole?: string;
    requiresCosignature?: boolean;
    supervisingPhysicianId?: string;
  }>({
    queryKey: ["/api/settings"],
  });

  const canCosign = userSettings?.emrRole === 'physician';

  if (isCheckingAccess || !emrAccess?.hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (showConsentDialog && !emrAccess.consentAcknowledged) {
    return (
      <EmrConsentDialog 
        open={true} 
        onConsentGiven={() => setShowConsentDialog(false)} 
      />
    );
  }

  const form = useForm<UpdatePatientFormData>({
    resolver: zodResolver(updatePatientSchema),
    values: patient ? {
      firstName: patient.firstName,
      lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().split('T')[0] : "",
      gender: patient.gender as any,
      email: patient.email || "",
      phone: patient.phone || "",
      address: patient.address || "",
      insuranceProvider: patient.insuranceProvider || "",
      insurancePolicyNumber: patient.insurancePolicyNumber || "",
      medicalHistory: patient.medicalHistory || "",
      allergies: patient.allergies || "",
      medications: patient.medications || "",
      emergencyContactName: patient.emergencyContactName || "",
      emergencyContactPhone: patient.emergencyContactPhone || "",
      isActive: patient.isActive ?? true,
    } : undefined,
  });

  const updatePatientMutation = useMutation({
    mutationFn: async (data: UpdatePatientFormData) => {
      const response = await apiRequest("PATCH", `/api/emr/patients/${patientId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", patientId] });
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients"] });
      toast({
        title: "Patient updated",
        description: "Patient record has been saved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update patient",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePatientMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/emr/patients/${patientId}`);
    },
    onSuccess: () => {
      toast({
        title: "Patient deleted",
        description: "Patient record has been removed",
      });
      navigate("/emr/patients");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete patient",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const vitalsForm = useForm<VitalsFormData>({
    resolver: zodResolver(vitalsInputSchema),
    defaultValues: {
      bloodPressureSystolic: "",
      bloodPressureDiastolic: "",
      heartRate: "",
      respiratoryRate: "",
      temperature: "",
      temperatureUnit: "F",
      oxygenSaturation: "",
      weight: "",
      weightUnit: "lbs",
      height: "",
      heightUnit: "in",
      painLevel: "",
      painLocation: "",
      bloodGlucose: "",
      notes: "",
    },
  });

  const createVitalsMutation = useMutation({
    mutationFn: async (data: VitalsFormData) => {
      const payload = {
        ...data,
        bloodPressureSystolic: data.bloodPressureSystolic ? parseInt(data.bloodPressureSystolic) : undefined,
        bloodPressureDiastolic: data.bloodPressureDiastolic ? parseInt(data.bloodPressureDiastolic) : undefined,
        heartRate: data.heartRate ? parseInt(data.heartRate) : undefined,
        respiratoryRate: data.respiratoryRate ? parseInt(data.respiratoryRate) : undefined,
        oxygenSaturation: data.oxygenSaturation ? parseInt(data.oxygenSaturation) : undefined,
        painLevel: data.painLevel ? parseInt(data.painLevel) : undefined,
        bloodGlucose: data.bloodGlucose ? parseInt(data.bloodGlucose) : undefined,
      };
      const response = await apiRequest("POST", `/api/emr/patients/${patientId}/vitals`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", patientId, "vitals"] });
      toast({
        title: "Vitals recorded",
        description: "Patient vitals have been saved",
      });
      vitalsForm.reset();
      setShowVitalsForm(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to record vitals",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const encounterForm = useForm<EncounterFormData>({
    resolver: zodResolver(encounterFormSchema),
    defaultValues: {
      encounterType: "office_visit",
      chiefComplaint: "",
      hpiOnset: "",
      hpiLocation: "",
      hpiDuration: "",
      hpiCharacter: "",
      hpiAggravating: "",
      hpiRelieving: "",
      hpiTiming: "",
      hpiSeverity: "",
      hpiAssociatedSymptoms: "",
      hpiContext: "",
      hpiNarrative: "",
      rosConstitutional: "",
      rosEyes: "",
      rosEnt: "",
      rosCardiovascular: "",
      rosRespiratory: "",
      rosGastrointestinal: "",
      rosGenitourinary: "",
      rosMusculoskeletal: "",
      rosSkin: "",
      rosNeurological: "",
      rosPsychiatric: "",
      rosEndocrine: "",
      rosHematologic: "",
      rosAllergic: "",
      peGeneral: "",
      peVitals: "",
      peHead: "",
      peEyes: "",
      peEnt: "",
      peNeck: "",
      peChest: "",
      peLungs: "",
      peHeart: "",
      peAbdomen: "",
      peBack: "",
      peExtremities: "",
      peSkin: "",
      peNeurological: "",
      pePsychiatric: "",
      assessmentSummary: "",
      planSummary: "",
    },
  });

  const editEncounterForm = useForm<EncounterFormData>({
    resolver: zodResolver(encounterFormSchema),
    values: editingEncounter ? {
      encounterType: (editingEncounter.encounterType as any) || "office_visit",
      chiefComplaint: editingEncounter.chiefComplaint || "",
      hpiOnset: editingEncounter.hpiOnset || "",
      hpiLocation: editingEncounter.hpiLocation || "",
      hpiDuration: editingEncounter.hpiDuration || "",
      hpiCharacter: editingEncounter.hpiCharacter || "",
      hpiAggravating: editingEncounter.hpiAggravating || "",
      hpiRelieving: editingEncounter.hpiRelieving || "",
      hpiTiming: editingEncounter.hpiTiming || "",
      hpiSeverity: editingEncounter.hpiSeverity || "",
      hpiAssociatedSymptoms: editingEncounter.hpiAssociatedSymptoms || "",
      hpiContext: editingEncounter.hpiContext || "",
      hpiNarrative: editingEncounter.hpiNarrative || "",
      rosConstitutional: editingEncounter.rosConstitutional || "",
      rosEyes: editingEncounter.rosEyes || "",
      rosEnt: editingEncounter.rosEnt || "",
      rosCardiovascular: editingEncounter.rosCardiovascular || "",
      rosRespiratory: editingEncounter.rosRespiratory || "",
      rosGastrointestinal: editingEncounter.rosGastrointestinal || "",
      rosGenitourinary: editingEncounter.rosGenitourinary || "",
      rosMusculoskeletal: editingEncounter.rosMusculoskeletal || "",
      rosSkin: editingEncounter.rosSkin || "",
      rosNeurological: editingEncounter.rosNeurological || "",
      rosPsychiatric: editingEncounter.rosPsychiatric || "",
      rosEndocrine: editingEncounter.rosEndocrine || "",
      rosHematologic: editingEncounter.rosHematologic || "",
      rosAllergic: editingEncounter.rosAllergic || "",
      peGeneral: editingEncounter.peGeneral || "",
      peVitals: editingEncounter.peVitals || "",
      peHead: editingEncounter.peHead || "",
      peEyes: editingEncounter.peEyes || "",
      peEnt: editingEncounter.peEnt || "",
      peNeck: editingEncounter.peNeck || "",
      peChest: editingEncounter.peChest || "",
      peLungs: editingEncounter.peLungs || "",
      peHeart: editingEncounter.peHeart || "",
      peAbdomen: editingEncounter.peAbdomen || "",
      peBack: editingEncounter.peBack || "",
      peExtremities: editingEncounter.peExtremities || "",
      peSkin: editingEncounter.peSkin || "",
      peNeurological: editingEncounter.peNeurological || "",
      pePsychiatric: editingEncounter.pePsychiatric || "",
      assessmentSummary: editingEncounter.assessmentSummary || "",
      planSummary: editingEncounter.planSummary || "",
    } : undefined,
  });

  const createEncounterMutation = useMutation({
    mutationFn: async (data: EncounterFormData) => {
      const enrichedData = {
        ...data,
        rosChecklist: JSON.stringify(rosChecklist),
        peChecklist: JSON.stringify(peChecklist),
        diagnosisCodes: JSON.stringify(diagnosisCodes),
        procedureCodes: JSON.stringify(procedureCodes),
        medications: JSON.stringify(medications),
      };
      const response = await apiRequest("POST", `/api/emr/patients/${patientId}/encounters`, enrichedData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", patientId, "encounters"] });
      toast({
        title: "Encounter created",
        description: "Clinical encounter has been saved",
      });
      encounterForm.reset();
      resetClinicalData();
      setShowEncounterDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create encounter",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetClinicalData = useCallback(() => {
    setRosChecklist({});
    setPeChecklist({});
    setDiagnosisCodes([]);
    setProcedureCodes([]);
    setMedications([]);
  }, []);

  const updateEncounterMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<EncounterFormData> }) => {
      // Preserve existing clinical JSON fields from the editing encounter
      const enrichedData = {
        ...data,
        // Preserve existing clinical data (don't overwrite with undefined)
        rosChecklist: editingEncounter?.rosChecklist,
        peChecklist: editingEncounter?.peChecklist,
        diagnosisCodes: editingEncounter?.diagnosisCodes,
        procedureCodes: editingEncounter?.procedureCodes,
        medications: editingEncounter?.medications,
      };
      const response = await apiRequest("PATCH", `/api/emr/encounters/${id}`, enrichedData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", patientId, "encounters"] });
      toast({
        title: "Encounter updated",
        description: "Clinical encounter has been updated",
      });
      setEditingEncounter(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update encounter",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const signEncounterMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/emr/encounters/${id}/sign`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", patientId, "encounters"] });
      toast({
        title: "Encounter signed",
        description: "Clinical encounter has been signed and finalized",
      });
      setViewingEncounter(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to sign encounter",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEncounterMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/emr/encounters/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", patientId, "encounters"] });
      toast({
        title: "Encounter deleted",
        description: "Clinical encounter has been removed",
      });
      setViewingEncounter(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete encounter",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reopenEncounterMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/emr/encounters/${id}/reopen`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", patientId, "encounters"] });
      toast({
        title: "Encounter reopened",
        description: "Encounter has been unlocked for editing",
      });
      setViewingEncounter(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to reopen encounter",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cosignEncounterMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/emr/encounters/${id}/cosign`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", patientId, "encounters"] });
      toast({
        title: "Encounter co-signed",
        description: "The encounter has been finalized with your co-signature",
      });
      setViewingEncounter(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to co-sign encounter",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const hasRosChecklistSelections = Object.values(rosChecklist).some(
    (items) => Array.isArray(items) && items.length > 0
  );
  const hasPeChecklistSelections = Object.values(peChecklist).some(
    (items) => Array.isArray(items) && items.length > 0
  );

  const hasUnsavedPatientChanges = form.formState.isDirty && !updatePatientMutation.isPending;
  const hasUnsavedNewEncounterChanges =
    showEncounterDialog &&
    !createEncounterMutation.isPending &&
    (encounterForm.formState.isDirty ||
      hasRosChecklistSelections ||
      hasPeChecklistSelections ||
      diagnosisCodes.length > 0 ||
      procedureCodes.length > 0 ||
      medications.length > 0);
  const hasUnsavedEditEncounterChanges =
    !!editingEncounter &&
    !updateEncounterMutation.isPending &&
    editEncounterForm.formState.isDirty;
  const hasAnyUnsavedChanges =
    hasUnsavedPatientChanges || hasUnsavedNewEncounterChanges || hasUnsavedEditEncounterChanges;

  const confirmDiscardUnsavedChanges = useCallback(() => {
    if (hasUnsavedNewEncounterChanges) {
      return window.confirm(UNSAVED_NEW_ENCOUNTER_MESSAGE);
    }
    if (hasUnsavedEditEncounterChanges) {
      return window.confirm(UNSAVED_EDIT_ENCOUNTER_MESSAGE);
    }
    if (hasUnsavedPatientChanges) {
      return window.confirm(UNSAVED_PATIENT_CHANGES_MESSAGE);
    }
    return true;
  }, [hasUnsavedEditEncounterChanges, hasUnsavedNewEncounterChanges, hasUnsavedPatientChanges]);

  const closeNewEncounterDialog = useCallback(() => {
    if (hasUnsavedNewEncounterChanges && !window.confirm(UNSAVED_NEW_ENCOUNTER_MESSAGE)) {
      return false;
    }
    encounterForm.reset();
    resetClinicalData();
    setShowEncounterDialog(false);
    return true;
  }, [encounterForm, hasUnsavedNewEncounterChanges, resetClinicalData]);

  const closeEditEncounterDialog = useCallback(() => {
    if (hasUnsavedEditEncounterChanges && !window.confirm(UNSAVED_EDIT_ENCOUNTER_MESSAGE)) {
      return false;
    }
    setEditingEncounter(null);
    return true;
  }, [hasUnsavedEditEncounterChanges]);

  const handleEncounterDialogOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setShowEncounterDialog(true);
        return;
      }
      closeNewEncounterDialog();
    },
    [closeNewEncounterDialog]
  );

  const handleEditingEncounterChange = useCallback(
    (encounter: PatientEncounter | null) => {
      if (encounter) {
        setEditingEncounter(encounter);
        return;
      }
      closeEditEncounterDialog();
    },
    [closeEditEncounterDialog]
  );

  const navigateWithUnsavedGuard = useCallback(
    (path: string) => {
      if (!confirmDiscardUnsavedChanges()) return;
      if (showEncounterDialog) {
        encounterForm.reset();
        resetClinicalData();
        setShowEncounterDialog(false);
      }
      if (editingEncounter) {
        setEditingEncounter(null);
      }
      navigate(path);
    },
    [
      confirmDiscardUnsavedChanges,
      editingEncounter,
      encounterForm,
      navigate,
      resetClinicalData,
      showEncounterDialog,
    ]
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasAnyUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasAnyUnsavedChanges]);

  useEffect(() => {
    const tabFromUrl = resolvePatientDetailTab(window.location.search);
    setActiveTab((currentTab) => (currentTab === tabFromUrl ? currentTab : tabFromUrl));
  }, [location]);

  const handleTabChange = useCallback(
    (tabValue: string) => {
      if (!PATIENT_DETAIL_TAB_SET.has(tabValue)) {
        return;
      }

      const nextTab = tabValue as PatientDetailTab;
      if (nextTab !== activeTab && !confirmDiscardUnsavedChanges()) {
        return;
      }

      if (nextTab !== activeTab) {
        if (showEncounterDialog) {
          encounterForm.reset();
          resetClinicalData();
          setShowEncounterDialog(false);
        }
        if (editingEncounter) {
          setEditingEncounter(null);
        }
      }

      setActiveTab(nextTab);

      const nextUrl =
        nextTab === DEFAULT_PATIENT_DETAIL_TAB
          ? `/emr/patients/${patientId}`
          : `/emr/patients/${patientId}?tab=${nextTab}`;
      navigate(nextUrl);
    },
    [
      activeTab,
      confirmDiscardUnsavedChanges,
      editingEncounter,
      encounterForm,
      navigate,
      patientId,
      resetClinicalData,
      showEncounterDialog,
    ]
  );

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Not set";
    return new Date(date).toLocaleDateString();
  };

  const formatDateTime = (date: Date | string | null | undefined) => {
    if (!date) return "Not set";
    return new Date(date).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Patient Not Found</h1>
          <Button onClick={() => navigateWithUnsavedGuard("/emr/patients")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Patients
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateWithUnsavedGuard("/emr/patients")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {patient.firstName} {patient.lastName}
              </h1>
              <p className="text-muted-foreground">
                Patient ID: {patient.id}
              </p>
            </div>
            {!patient.isActive && (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" data-testid="button-delete-patient">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Patient?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete {patient.firstName} {patient.lastName}'s record.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deletePatientMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 flex-wrap gap-1">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Heart className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="demographics" data-testid="tab-demographics">
              <User className="h-4 w-4 mr-2" />
              Demographics
            </TabsTrigger>
            <TabsTrigger value="vitals" data-testid="tab-vitals">
              <Activity className="h-4 w-4 mr-2" />
              Vitals ({patientVitals.length})
            </TabsTrigger>
            <TabsTrigger value="encounters" data-testid="tab-encounters">
              <Stethoscope className="h-4 w-4 mr-2" />
              Encounters ({patientEncounters.length})
            </TabsTrigger>
            <TabsTrigger value="medical" data-testid="tab-medical">
              <Heart className="h-4 w-4 mr-2" />
              Medical Info
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes">
              <FileText className="h-4 w-4 mr-2" />
              Visit Notes ({patientNotes.length})
            </TabsTrigger>
            <TabsTrigger value="appointments" data-testid="tab-appointments">
              <CalendarDays className="h-4 w-4 mr-2" />
              Appointments ({patientAppointments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <PatientOverview
              patient={patient}
              vitals={patientVitals}
              encounters={patientEncounters}
              notes={patientNotes}
              appointments={patientAppointments}
              onRecordVitals={() => setShowVitalsForm(true)}
              onNewEncounter={() => {
                encounterForm.reset();
                setShowEncounterDialog(true);
              }}
              onNavigate={(path: string) => navigateWithUnsavedGuard(path)}
            />
          </TabsContent>

          <TabsContent value="demographics">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => updatePatientMutation.mutate(data))}
                className="space-y-6"
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Personal Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-first-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-last-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="dateOfBirth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date of Birth</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} data-testid="input-dob" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-gender">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                                <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} data-testid="input-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Textarea {...field} data-testid="input-address" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Insurance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="insuranceProvider"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Insurance Provider</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-insurance-provider" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="insurancePolicyNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Policy Number</FormLabel>
                          <FormControl>
                            <Input {...field} data-testid="input-policy-number" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Emergency Contact</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="emergencyContactName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Name</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-emergency-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="emergencyContactPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contact Phone</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-emergency-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={updatePatientMutation.isPending}
                    data-testid="button-save-patient"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updatePatientMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="vitals">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Vital Signs
                  </CardTitle>
                  <CardDescription>
                    Track patient vital signs over time
                  </CardDescription>
                </div>
                <Button
                  onClick={() => setShowVitalsForm(!showVitalsForm)}
                  data-testid="button-add-vitals"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Record Vitals
                </Button>
              </CardHeader>
              <CardContent>
                {showVitalsForm && (
                  <div className="mb-6 p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-medium mb-4">Record New Vitals</h4>
                    <form onSubmit={vitalsForm.handleSubmit((data) => createVitalsMutation.mutate(data))} className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium">BP Systolic (mmHg)</label>
                          <Input {...vitalsForm.register("bloodPressureSystolic")} placeholder="120" data-testid="input-bp-systolic" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">BP Diastolic (mmHg)</label>
                          <Input {...vitalsForm.register("bloodPressureDiastolic")} placeholder="80" data-testid="input-bp-diastolic" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Heart Rate (bpm)</label>
                          <Input {...vitalsForm.register("heartRate")} placeholder="72" data-testid="input-heart-rate" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Resp. Rate (/min)</label>
                          <Input {...vitalsForm.register("respiratoryRate")} placeholder="16" data-testid="input-resp-rate" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium">Temperature</label>
                          <div className="flex gap-2">
                            <Input {...vitalsForm.register("temperature")} placeholder="98.6" data-testid="input-temp" className="flex-1" />
                            <Select
                              value={vitalsForm.watch("temperatureUnit")}
                              onValueChange={(v) => vitalsForm.setValue("temperatureUnit", v as "F" | "C")}
                            >
                              <SelectTrigger className="w-16">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="F">°F</SelectItem>
                                <SelectItem value="C">°C</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium">SpO2 (%)</label>
                          <Input {...vitalsForm.register("oxygenSaturation")} placeholder="98" data-testid="input-spo2" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Weight</label>
                          <div className="flex gap-2">
                            <Input {...vitalsForm.register("weight")} placeholder="150" data-testid="input-weight" className="flex-1" />
                            <Select
                              value={vitalsForm.watch("weightUnit")}
                              onValueChange={(v) => vitalsForm.setValue("weightUnit", v as "lbs" | "kg")}
                            >
                              <SelectTrigger className="w-16">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="lbs">lbs</SelectItem>
                                <SelectItem value="kg">kg</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Height</label>
                          <div className="flex gap-2">
                            <Input {...vitalsForm.register("height")} placeholder="68" data-testid="input-height" className="flex-1" />
                            <Select
                              value={vitalsForm.watch("heightUnit")}
                              onValueChange={(v) => vitalsForm.setValue("heightUnit", v as "in" | "cm")}
                            >
                              <SelectTrigger className="w-16">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="in">in</SelectItem>
                                <SelectItem value="cm">cm</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium">Pain Level (0-10)</label>
                          <Input {...vitalsForm.register("painLevel")} placeholder="0" data-testid="input-pain" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Pain Location</label>
                          <Input {...vitalsForm.register("painLocation")} placeholder="N/A" data-testid="input-pain-location" />
                        </div>
                        <div>
                          <label className="text-sm font-medium">Blood Glucose (mg/dL)</label>
                          <Input {...vitalsForm.register("bloodGlucose")} placeholder="" data-testid="input-glucose" />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Notes</label>
                        <Textarea {...vitalsForm.register("notes")} placeholder="Additional notes..." data-testid="input-vitals-notes" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => setShowVitalsForm(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createVitalsMutation.isPending}>
                          {createVitalsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Save Vitals
                        </Button>
                      </div>
                    </form>
                  </div>
                )}

                {patientVitals.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">Date</th>
                          <th className="text-left py-2 px-2">BP</th>
                          <th className="text-left py-2 px-2">HR</th>
                          <th className="text-left py-2 px-2">RR</th>
                          <th className="text-left py-2 px-2">Temp</th>
                          <th className="text-left py-2 px-2">SpO2</th>
                          <th className="text-left py-2 px-2">Weight</th>
                          <th className="text-left py-2 px-2">Pain</th>
                        </tr>
                      </thead>
                      <tbody>
                        {patientVitals.map((v) => (
                          <tr key={v.id} className="border-b hover-elevate" data-testid={`vitals-row-${v.id}`}>
                            <td className="py-2 px-2">{formatDateTime(v.recordedAt)}</td>
                            <td className="py-2 px-2">
                              {v.bloodPressureSystolic && v.bloodPressureDiastolic
                                ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}`
                                : "-"}
                            </td>
                            <td className="py-2 px-2">{v.heartRate || "-"}</td>
                            <td className="py-2 px-2">{v.respiratoryRate || "-"}</td>
                            <td className="py-2 px-2">{v.temperature ? `${v.temperature}°${v.temperatureUnit}` : "-"}</td>
                            <td className="py-2 px-2">{v.oxygenSaturation ? `${v.oxygenSaturation}%` : "-"}</td>
                            <td className="py-2 px-2">{v.weight ? `${v.weight} ${v.weightUnit}` : "-"}</td>
                            <td className="py-2 px-2">{v.painLevel !== null ? v.painLevel : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No vitals recorded yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="encounters" className="h-full">
            <Card className="flex flex-col h-full">
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-shrink-0">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="h-5 w-5 text-primary" />
                    Clinical Encounters
                  </CardTitle>
                  <CardDescription>
                    HPI, Review of Systems, Physical Exam, and Assessment
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    encounterForm.reset();
                    setShowEncounterDialog(true);
                  }}
                  data-testid="button-new-encounter"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Encounter
                </Button>
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                <ScrollArea className="h-[calc(100vh-400px)] min-h-[300px]">
                  {patientEncounters.length > 0 ? (
                    <div className="space-y-4 pr-4">
                      {patientEncounters.map((enc) => (
                        <div
                          key={enc.id}
                          className="p-4 border rounded-lg hover-elevate cursor-pointer"
                          onClick={() => setViewingEncounter(enc)}
                          data-testid={`encounter-${enc.id}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="font-medium">{formatDate(enc.encounterDate)}</span>
                                <Badge variant={enc.status === "signed" ? "default" : enc.status === "pending_cosign" ? "outline" : "secondary"}>
                                  {enc.status === "signed" ? "Signed" : enc.status === "pending_cosign" ? "Awaiting Co-sign" : enc.status === "completed" ? "Completed" : "In Progress"}
                                </Badge>
                                <Badge variant="outline">{enc.encounterType?.replace("_", " ") || "Office Visit"}</Badge>
                              </div>
                              {enc.chiefComplaint && (
                                <p className="text-sm"><span className="font-medium">CC:</span> {enc.chiefComplaint}</p>
                              )}
                              {enc.hpiNarrative && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                  <span className="font-medium">HPI:</span> {enc.hpiNarrative}
                                </p>
                              )}
                              {enc.assessmentSummary && (
                                <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                                  <span className="font-medium">Assessment:</span> {enc.assessmentSummary}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDateTime(enc.encounterDate)}
                              </div>
                              {enc.signedAt && (
                                <div className="text-xs">
                                  Signed: {formatDateTime(enc.signedAt)}
                                </div>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="mt-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingEncounter(enc);
                                }}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No encounters recorded yet</p>
                      <p className="text-sm mt-2">Create a new encounter to document HPI, ROS, and Physical Exam</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="medical">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => updatePatientMutation.mutate(data))}
                className="space-y-6"
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-destructive" />
                      Allergies
                    </CardTitle>
                    <CardDescription>
                      List all known allergies (medications, foods, environmental)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="allergies"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <StructuredAllergyInput value={field.value || ""} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-primary" />
                      Current Medications
                    </CardTitle>
                    <CardDescription>
                      List all current medications with dosages
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="medications"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <StructuredMedicationInput value={field.value || ""} onChange={field.onChange} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Heart className="h-5 w-5 text-red-500" />
                      Medical History
                    </CardTitle>
                    <CardDescription>
                      Past medical conditions, surgeries, and relevant history
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="medicalHistory"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              placeholder="e.g., Type 2 Diabetes (2018), Hypertension (2020), Appendectomy (2015)"
                              className="min-h-[150px]"
                              {...field}
                              data-testid="input-medical-history"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={updatePatientMutation.isPending}
                    data-testid="button-save-medical"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updatePatientMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="notes">
            <Card>
              <CardHeader>
                <CardTitle>Visit Notes</CardTitle>
                <CardDescription>
                  Clinical notes linked to this patient
                </CardDescription>
              </CardHeader>
              <CardContent>
                {patientNotes.length > 0 ? (
                  <div className="space-y-3">
                    {patientNotes.map((note) => (
                      <div
                        key={note.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                        data-testid={`note-${note.id}`}
                      >
                        <div
                          className="flex-1 cursor-pointer"
                          onClick={() => navigateWithUnsavedGuard(`/notes/${note.id}`)}
                        >
                          <p className="font-medium">{note.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(note.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {note.specialty && (
                            <Badge variant="secondary">{note.specialty}</Badge>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              encounterForm.reset();
                              if (note.title) encounterForm.setValue('chiefComplaint', note.title);
                              if (note.subjective) encounterForm.setValue('hpiNarrative', note.subjective);
                              if (note.assessment) encounterForm.setValue('assessmentSummary', note.assessment);
                              if (note.plan) encounterForm.setValue('planSummary', note.plan);
                              setShowEncounterDialog(true);
                            }}
                            data-testid={`button-create-encounter-from-note-${note.id}`}
                          >
                            <Stethoscope className="h-3 w-3 mr-1" />
                            Create Encounter
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No notes linked to this patient yet</p>
                    <p className="text-sm mt-2">Link SOAP notes to this patient during note creation</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appointments">
            <Card>
              <CardHeader>
                <CardTitle>Appointments</CardTitle>
                <CardDescription>
                  Past and upcoming appointments
                </CardDescription>
              </CardHeader>
              <CardContent>
                {patientAppointments.length > 0 ? (
                  <div className="space-y-3">
                    {patientAppointments.map((apt) => (
                      <div
                        key={apt.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`appointment-${apt.id}`}
                      >
                        <div>
                          <p className="font-medium">{apt.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDateTime(apt.startTime)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            apt.status === "completed"
                              ? "default"
                              : apt.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {apt.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No appointments scheduled</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <EncounterDialogs
        showEncounterDialog={showEncounterDialog}
        setShowEncounterDialog={handleEncounterDialogOpenChange}
        viewingEncounter={viewingEncounter}
        setViewingEncounter={setViewingEncounter}
        editingEncounter={editingEncounter}
        setEditingEncounter={handleEditingEncounterChange}
        encounterForm={encounterForm}
        editEncounterForm={editEncounterForm}
        createEncounterMutation={createEncounterMutation}
        updateEncounterMutation={updateEncounterMutation}
        signEncounterMutation={signEncounterMutation}
        deleteEncounterMutation={deleteEncounterMutation}
        reopenEncounterMutation={reopenEncounterMutation}
        cosignEncounterMutation={cosignEncounterMutation}
        canCosign={canCosign}
        patientNotes={patientNotes}
        rosChecklist={rosChecklist}
        setRosChecklist={setRosChecklist}
        peChecklist={peChecklist}
        setPeChecklist={setPeChecklist}
        diagnosisCodes={diagnosisCodes}
        setDiagnosisCodes={setDiagnosisCodes}
        procedureCodes={procedureCodes}
        setProcedureCodes={setProcedureCodes}
        medications={medications}
        setMedications={setMedications}
        formatDate={formatDate}
        formatDateTime={formatDateTime}
      />
    </div>
  );
}
