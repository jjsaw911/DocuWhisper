import { useState, useEffect } from "react";
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

const updatePatientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
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

const encounterFormSchema = z.object({
  encounterType: z.string().default("office_visit"),
  chiefComplaint: z.string().optional(),
  hpiOnset: z.string().optional(),
  hpiLocation: z.string().optional(),
  hpiDuration: z.string().optional(),
  hpiCharacter: z.string().optional(),
  hpiAggravating: z.string().optional(),
  hpiRelieving: z.string().optional(),
  hpiTiming: z.string().optional(),
  hpiSeverity: z.string().optional(),
  hpiAssociatedSymptoms: z.string().optional(),
  hpiContext: z.string().optional(),
  hpiNarrative: z.string().optional(),
  rosConstitutional: z.string().optional(),
  rosEyes: z.string().optional(),
  rosEnt: z.string().optional(),
  rosCardiovascular: z.string().optional(),
  rosRespiratory: z.string().optional(),
  rosGastrointestinal: z.string().optional(),
  rosGenitourinary: z.string().optional(),
  rosMusculoskeletal: z.string().optional(),
  rosSkin: z.string().optional(),
  rosNeurological: z.string().optional(),
  rosPsychiatric: z.string().optional(),
  rosEndocrine: z.string().optional(),
  rosHematologic: z.string().optional(),
  rosAllergic: z.string().optional(),
  peGeneral: z.string().optional(),
  peVitals: z.string().optional(),
  peHead: z.string().optional(),
  peEyes: z.string().optional(),
  peEnt: z.string().optional(),
  peNeck: z.string().optional(),
  peChest: z.string().optional(),
  peLungs: z.string().optional(),
  peHeart: z.string().optional(),
  peAbdomen: z.string().optional(),
  peBack: z.string().optional(),
  peExtremities: z.string().optional(),
  peSkin: z.string().optional(),
  peNeurological: z.string().optional(),
  pePsychiatric: z.string().optional(),
  assessmentSummary: z.string().optional(),
  planSummary: z.string().optional(),
});

type EncounterFormData = z.infer<typeof encounterFormSchema>;

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const patientId = parseInt(id || "0");
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showVitalsForm, setShowVitalsForm] = useState(false);
  const [showEncounterDialog, setShowEncounterDialog] = useState(false);
  const [viewingEncounter, setViewingEncounter] = useState<PatientEncounter | null>(null);
  const [editingEncounter, setEditingEncounter] = useState<PatientEncounter | null>(null);

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
      const response = await apiRequest("POST", `/api/emr/patients/${patientId}/encounters`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", patientId, "encounters"] });
      toast({
        title: "Encounter created",
        description: "Clinical encounter has been saved",
      });
      encounterForm.reset();
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

  const updateEncounterMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<EncounterFormData> }) => {
      const response = await apiRequest("PATCH", `/api/emr/encounters/${id}`, data);
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
          <Button onClick={() => navigate("/emr/patients")}>
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
              onClick={() => navigate("/emr/patients")}
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

        <Tabs defaultValue="demographics">
          <TabsList className="mb-6 flex-wrap gap-1">
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
                            <Textarea
                              placeholder="e.g., Penicillin, Peanuts, Latex"
                              className="min-h-[100px]"
                              {...field}
                              data-testid="input-allergies"
                            />
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
                            <Textarea
                              placeholder="e.g., Metformin 500mg twice daily, Lisinopril 10mg once daily"
                              className="min-h-[100px]"
                              {...field}
                              data-testid="input-medications"
                            />
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
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/notes/${note.id}`)}
                        data-testid={`note-${note.id}`}
                      >
                        <div>
                          <p className="font-medium">{note.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(note.createdAt)}
                          </p>
                        </div>
                        {note.specialty && (
                          <Badge variant="secondary">{note.specialty}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No notes linked to this patient yet</p>
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

      {/* New Encounter Dialog */}
      <Dialog open={showEncounterDialog} onOpenChange={setShowEncounterDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              New Clinical Encounter
            </DialogTitle>
            <DialogDescription>
              Document HPI, Review of Systems, and Physical Examination
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <Form {...encounterForm}>
              <form className="space-y-6 pb-4">
                {/* Encounter Type */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Encounter Type</h3>
                  </div>
                  <FormField
                    control={encounterForm.control}
                    name="encounterType"
                    render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-encounter-type">
                              <SelectValue placeholder="Select encounter type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="office_visit">Office Visit</SelectItem>
                            <SelectItem value="telehealth">Telehealth</SelectItem>
                            <SelectItem value="phone">Phone Consultation</SelectItem>
                            <SelectItem value="follow_up">Follow Up</SelectItem>
                            <SelectItem value="urgent">Urgent Care</SelectItem>
                            <SelectItem value="annual_physical">Annual Physical</SelectItem>
                            <SelectItem value="procedure">Procedure</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Chief Complaint */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Chief Complaint</h3>
                  </div>
                  <FormField
                    control={encounterForm.control}
                    name="chiefComplaint"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Patient's primary reason for visit..."
                            className="min-h-[80px]"
                            data-testid="input-chief-complaint"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* HPI Section */}
                <Accordion type="single" collapsible defaultValue="hpi">
                  <AccordionItem value="hpi">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-semibold">History of Present Illness (HPI)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={encounterForm.control}
                          name="hpiOnset"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Onset</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="When did symptoms start?" data-testid="input-hpi-onset" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiLocation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Where is the problem?" data-testid="input-hpi-location" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiDuration"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Duration</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="How long has this been going on?" data-testid="input-hpi-duration" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiCharacter"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Character/Quality</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Describe the symptom quality" data-testid="input-hpi-character" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiAggravating"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Aggravating Factors</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="What makes it worse?" data-testid="input-hpi-aggravating" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiRelieving"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Relieving Factors</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="What makes it better?" data-testid="input-hpi-relieving" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiTiming"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Timing</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="When does it occur?" data-testid="input-hpi-timing" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="hpiSeverity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Severity (1-10)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Rate 1-10" data-testid="input-hpi-severity" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={encounterForm.control}
                        name="hpiAssociatedSymptoms"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Associated Symptoms</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Other symptoms present..." data-testid="input-hpi-associated" className="min-h-[60px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={encounterForm.control}
                        name="hpiContext"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Context</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Social/environmental context..." data-testid="input-hpi-context" className="min-h-[60px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={encounterForm.control}
                        name="hpiNarrative"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Narrative HPI</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Free-text HPI narrative..." data-testid="input-hpi-narrative" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* ROS Section */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="ros">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        <span className="font-semibold">Review of Systems (ROS)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={encounterForm.control}
                          name="rosConstitutional"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Constitutional</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Fever, weight loss, fatigue..." data-testid="input-ros-constitutional" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosEyes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Eyes</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Vision changes, pain..." data-testid="input-ros-eyes" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosEnt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ENT</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Ears, nose, throat..." data-testid="input-ros-ent" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosCardiovascular"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Cardiovascular</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Chest pain, palpitations..." data-testid="input-ros-cv" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosRespiratory"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Respiratory</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Cough, shortness of breath..." data-testid="input-ros-resp" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosGastrointestinal"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Gastrointestinal</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Nausea, abdominal pain..." data-testid="input-ros-gi" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosGenitourinary"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Genitourinary</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Urinary symptoms..." data-testid="input-ros-gu" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosMusculoskeletal"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Musculoskeletal</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Joint pain, stiffness..." data-testid="input-ros-msk" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosSkin"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Skin</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Rashes, lesions..." data-testid="input-ros-skin" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosNeurological"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Neurological</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Headache, numbness..." data-testid="input-ros-neuro" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosPsychiatric"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Psychiatric</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Anxiety, depression..." data-testid="input-ros-psych" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosEndocrine"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Endocrine</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Thyroid, diabetes..." data-testid="input-ros-endo" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosHematologic"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Hematologic/Lymphatic</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Bruising, bleeding..." data-testid="input-ros-heme" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="rosAllergic"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Allergic/Immunologic</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Allergies, immune issues..." data-testid="input-ros-allergy" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Physical Exam Section */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="pe">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-primary" />
                        <span className="font-semibold">Physical Examination</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={encounterForm.control}
                          name="peGeneral"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>General Appearance</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Alert, well-appearing..." data-testid="input-pe-general" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peVitals"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vital Signs Summary</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="BP, HR, RR, Temp..." data-testid="input-pe-vitals" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peHead"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Head</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Normocephalic, atraumatic..." data-testid="input-pe-head" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peEyes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Eyes</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="PERRLA, EOM intact..." data-testid="input-pe-eyes" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peEnt"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ENT</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="TMs clear, pharynx normal..." data-testid="input-pe-ent" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peNeck"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Neck</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Supple, no LAD..." data-testid="input-pe-neck" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peChest"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Chest/Breast</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="No deformity..." data-testid="input-pe-chest" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peLungs"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Lungs</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="CTAB, no wheezes/rales..." data-testid="input-pe-lungs" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peHeart"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Heart</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="RRR, no murmurs..." data-testid="input-pe-heart" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peAbdomen"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Abdomen</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Soft, non-tender..." data-testid="input-pe-abdomen" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peBack"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Back</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="No CVA tenderness..." data-testid="input-pe-back" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peExtremities"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Extremities</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="No edema, pulses intact..." data-testid="input-pe-extremities" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peSkin"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Skin</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Warm, dry, no rashes..." data-testid="input-pe-skin" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="peNeurological"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Neurological</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="A&O x3, CN II-XII intact..." data-testid="input-pe-neuro" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={encounterForm.control}
                          name="pePsychiatric"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Psychiatric</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Mood/affect appropriate..." data-testid="input-pe-psych" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Assessment & Plan */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="ap">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <PenLine className="h-4 w-4 text-primary" />
                        <span className="font-semibold">Assessment & Plan</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <FormField
                        control={encounterForm.control}
                        name="assessmentSummary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Assessment Summary</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Clinical impression, diagnosis..." data-testid="input-assessment" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={encounterForm.control}
                        name="planSummary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plan Summary</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Treatment plan, follow-up..." data-testid="input-plan" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </form>
            </Form>
          </ScrollArea>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowEncounterDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={encounterForm.handleSubmit((data) => createEncounterMutation.mutate(data))}
              disabled={createEncounterMutation.isPending}
              data-testid="button-save-encounter"
            >
              {createEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Encounter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Encounter Dialog */}
      <Dialog open={!!viewingEncounter} onOpenChange={(open) => !open && setViewingEncounter(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              Clinical Encounter - {viewingEncounter && formatDate(viewingEncounter.encounterDate)}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 flex-wrap">
              <Badge variant={viewingEncounter?.status === "signed" ? "default" : viewingEncounter?.status === "pending_cosign" ? "outline" : "secondary"}>
                {viewingEncounter?.status === "signed" ? "Signed" : viewingEncounter?.status === "pending_cosign" ? "Awaiting Co-sign" : viewingEncounter?.status === "completed" ? "Completed" : "In Progress"}
              </Badge>
              <Badge variant="outline">{viewingEncounter?.encounterType?.replace("_", " ") || "Office Visit"}</Badge>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-4">
            {viewingEncounter && (
              <div className="space-y-6 pb-4">
                {/* Chief Complaint */}
                {viewingEncounter.chiefComplaint && (
                  <div className="space-y-2">
                    <h3 className="font-semibold flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-primary" />
                      Chief Complaint
                    </h3>
                    <p className="text-sm bg-muted p-3 rounded-md">{viewingEncounter.chiefComplaint}</p>
                  </div>
                )}

                {/* HPI */}
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    History of Present Illness
                  </h3>
                  <div className="bg-muted p-4 rounded-md space-y-3">
                    {viewingEncounter.hpiNarrative && (
                      <div>
                        <span className="font-medium text-sm">Narrative: </span>
                        <span className="text-sm">{viewingEncounter.hpiNarrative}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {viewingEncounter.hpiOnset && (
                        <div><span className="font-medium">Onset:</span> {viewingEncounter.hpiOnset}</div>
                      )}
                      {viewingEncounter.hpiLocation && (
                        <div><span className="font-medium">Location:</span> {viewingEncounter.hpiLocation}</div>
                      )}
                      {viewingEncounter.hpiDuration && (
                        <div><span className="font-medium">Duration:</span> {viewingEncounter.hpiDuration}</div>
                      )}
                      {viewingEncounter.hpiCharacter && (
                        <div><span className="font-medium">Character:</span> {viewingEncounter.hpiCharacter}</div>
                      )}
                      {viewingEncounter.hpiAggravating && (
                        <div><span className="font-medium">Aggravating:</span> {viewingEncounter.hpiAggravating}</div>
                      )}
                      {viewingEncounter.hpiRelieving && (
                        <div><span className="font-medium">Relieving:</span> {viewingEncounter.hpiRelieving}</div>
                      )}
                      {viewingEncounter.hpiTiming && (
                        <div><span className="font-medium">Timing:</span> {viewingEncounter.hpiTiming}</div>
                      )}
                      {viewingEncounter.hpiSeverity && (
                        <div><span className="font-medium">Severity:</span> {viewingEncounter.hpiSeverity}</div>
                      )}
                    </div>
                    {viewingEncounter.hpiAssociatedSymptoms && (
                      <div className="text-sm">
                        <span className="font-medium">Associated Symptoms:</span> {viewingEncounter.hpiAssociatedSymptoms}
                      </div>
                    )}
                    {viewingEncounter.hpiContext && (
                      <div className="text-sm">
                        <span className="font-medium">Context:</span> {viewingEncounter.hpiContext}
                      </div>
                    )}
                    {!viewingEncounter.hpiNarrative && !viewingEncounter.hpiOnset && (
                      <p className="text-sm text-muted-foreground">No HPI documented</p>
                    )}
                  </div>
                </div>

                {/* ROS */}
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    Review of Systems
                  </h3>
                  <div className="bg-muted p-4 rounded-md">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      {viewingEncounter.rosConstitutional && (
                        <div><span className="font-medium">Constitutional:</span> {viewingEncounter.rosConstitutional}</div>
                      )}
                      {viewingEncounter.rosEyes && (
                        <div><span className="font-medium">Eyes:</span> {viewingEncounter.rosEyes}</div>
                      )}
                      {viewingEncounter.rosEnt && (
                        <div><span className="font-medium">ENT:</span> {viewingEncounter.rosEnt}</div>
                      )}
                      {viewingEncounter.rosCardiovascular && (
                        <div><span className="font-medium">Cardiovascular:</span> {viewingEncounter.rosCardiovascular}</div>
                      )}
                      {viewingEncounter.rosRespiratory && (
                        <div><span className="font-medium">Respiratory:</span> {viewingEncounter.rosRespiratory}</div>
                      )}
                      {viewingEncounter.rosGastrointestinal && (
                        <div><span className="font-medium">GI:</span> {viewingEncounter.rosGastrointestinal}</div>
                      )}
                      {viewingEncounter.rosGenitourinary && (
                        <div><span className="font-medium">GU:</span> {viewingEncounter.rosGenitourinary}</div>
                      )}
                      {viewingEncounter.rosMusculoskeletal && (
                        <div><span className="font-medium">MSK:</span> {viewingEncounter.rosMusculoskeletal}</div>
                      )}
                      {viewingEncounter.rosSkin && (
                        <div><span className="font-medium">Skin:</span> {viewingEncounter.rosSkin}</div>
                      )}
                      {viewingEncounter.rosNeurological && (
                        <div><span className="font-medium">Neuro:</span> {viewingEncounter.rosNeurological}</div>
                      )}
                      {viewingEncounter.rosPsychiatric && (
                        <div><span className="font-medium">Psych:</span> {viewingEncounter.rosPsychiatric}</div>
                      )}
                      {viewingEncounter.rosEndocrine && (
                        <div><span className="font-medium">Endocrine:</span> {viewingEncounter.rosEndocrine}</div>
                      )}
                      {viewingEncounter.rosHematologic && (
                        <div><span className="font-medium">Hematologic:</span> {viewingEncounter.rosHematologic}</div>
                      )}
                      {viewingEncounter.rosAllergic && (
                        <div><span className="font-medium">Allergic:</span> {viewingEncounter.rosAllergic}</div>
                      )}
                    </div>
                    {!viewingEncounter.rosConstitutional && !viewingEncounter.rosEyes && !viewingEncounter.rosCardiovascular && (
                      <p className="text-sm text-muted-foreground">No ROS documented</p>
                    )}
                  </div>
                </div>

                {/* Physical Exam */}
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-primary" />
                    Physical Examination
                  </h3>
                  <div className="bg-muted p-4 rounded-md">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      {viewingEncounter.peGeneral && (
                        <div><span className="font-medium">General:</span> {viewingEncounter.peGeneral}</div>
                      )}
                      {viewingEncounter.peVitals && (
                        <div><span className="font-medium">Vitals:</span> {viewingEncounter.peVitals}</div>
                      )}
                      {viewingEncounter.peHead && (
                        <div><span className="font-medium">Head:</span> {viewingEncounter.peHead}</div>
                      )}
                      {viewingEncounter.peEyes && (
                        <div><span className="font-medium">Eyes:</span> {viewingEncounter.peEyes}</div>
                      )}
                      {viewingEncounter.peEnt && (
                        <div><span className="font-medium">ENT:</span> {viewingEncounter.peEnt}</div>
                      )}
                      {viewingEncounter.peNeck && (
                        <div><span className="font-medium">Neck:</span> {viewingEncounter.peNeck}</div>
                      )}
                      {viewingEncounter.peChest && (
                        <div><span className="font-medium">Chest:</span> {viewingEncounter.peChest}</div>
                      )}
                      {viewingEncounter.peLungs && (
                        <div><span className="font-medium">Lungs:</span> {viewingEncounter.peLungs}</div>
                      )}
                      {viewingEncounter.peHeart && (
                        <div><span className="font-medium">Heart:</span> {viewingEncounter.peHeart}</div>
                      )}
                      {viewingEncounter.peAbdomen && (
                        <div><span className="font-medium">Abdomen:</span> {viewingEncounter.peAbdomen}</div>
                      )}
                      {viewingEncounter.peBack && (
                        <div><span className="font-medium">Back:</span> {viewingEncounter.peBack}</div>
                      )}
                      {viewingEncounter.peExtremities && (
                        <div><span className="font-medium">Extremities:</span> {viewingEncounter.peExtremities}</div>
                      )}
                      {viewingEncounter.peSkin && (
                        <div><span className="font-medium">Skin:</span> {viewingEncounter.peSkin}</div>
                      )}
                      {viewingEncounter.peNeurological && (
                        <div><span className="font-medium">Neurological:</span> {viewingEncounter.peNeurological}</div>
                      )}
                      {viewingEncounter.pePsychiatric && (
                        <div><span className="font-medium">Psychiatric:</span> {viewingEncounter.pePsychiatric}</div>
                      )}
                    </div>
                    {!viewingEncounter.peGeneral && !viewingEncounter.peHeart && !viewingEncounter.peLungs && (
                      <p className="text-sm text-muted-foreground">No physical exam documented</p>
                    )}
                  </div>
                </div>

                {/* Assessment & Plan */}
                <div className="space-y-2">
                  <h3 className="font-semibold flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-primary" />
                    Assessment & Plan
                  </h3>
                  <div className="bg-muted p-4 rounded-md space-y-3">
                    {viewingEncounter.assessmentSummary && (
                      <div>
                        <span className="font-medium text-sm">Assessment: </span>
                        <span className="text-sm">{viewingEncounter.assessmentSummary}</span>
                      </div>
                    )}
                    {viewingEncounter.planSummary && (
                      <div>
                        <span className="font-medium text-sm">Plan: </span>
                        <span className="text-sm">{viewingEncounter.planSummary}</span>
                      </div>
                    )}
                    {!viewingEncounter.assessmentSummary && !viewingEncounter.planSummary && (
                      <p className="text-sm text-muted-foreground">No assessment/plan documented</p>
                    )}
                  </div>
                </div>

                {/* Signature info */}
                {viewingEncounter.signedAt && (
                  <div className="text-sm text-muted-foreground border-t pt-4">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      Signed on {formatDateTime(viewingEncounter.signedAt)} by {viewingEncounter.signedBy}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="flex-shrink-0 pt-4 border-t gap-2 flex-wrap">
            {viewingEncounter && viewingEncounter.status !== "signed" && (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Encounter?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this clinical encounter. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => viewingEncounter && deleteEncounterMutation.mutate(viewingEncounter.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button 
                  variant="outline"
                  onClick={() => {
                    if (viewingEncounter) {
                      setEditingEncounter(viewingEncounter);
                      setViewingEncounter(null);
                    }
                  }}
                  data-testid="button-open-edit-encounter"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Open to Edit
                </Button>
                <Button 
                  onClick={() => viewingEncounter && signEncounterMutation.mutate(viewingEncounter.id)}
                  disabled={signEncounterMutation.isPending}
                  data-testid="button-sign-encounter"
                >
                  {signEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <PenLine className="h-4 w-4 mr-2" />
                  Sign & Finalize
                </Button>
              </>
            )}
            {viewingEncounter && viewingEncounter.status === "signed" && (
              <Button 
                variant="outline" 
                onClick={() => viewingEncounter && reopenEncounterMutation.mutate(viewingEncounter.id)}
                disabled={reopenEncounterMutation.isPending}
              >
                {reopenEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Unlock className="h-4 w-4 mr-2" />
                Reopen for Editing
              </Button>
            )}
            {viewingEncounter && viewingEncounter.status === "pending_cosign" && canCosign && (
              <Button 
                onClick={() => viewingEncounter && cosignEncounterMutation.mutate(viewingEncounter.id)}
                disabled={cosignEncounterMutation.isPending}
                data-testid="button-cosign-encounter"
              >
                {cosignEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <PenLine className="h-4 w-4 mr-2" />
                Co-sign & Finalize
              </Button>
            )}
            {viewingEncounter && viewingEncounter.status === "pending_cosign" && !canCosign && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Clock className="h-4 w-4" />
                Awaiting physician co-signature
              </div>
            )}
            <Button variant="outline" onClick={() => setViewingEncounter(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Encounter Dialog */}
      <Dialog open={!!editingEncounter} onOpenChange={(open) => !open && setEditingEncounter(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-primary" />
              Edit Clinical Encounter - {editingEncounter && formatDate(editingEncounter.encounterDate)}
            </DialogTitle>
            <DialogDescription>
              Update encounter documentation
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <Form {...editEncounterForm}>
              <form className="space-y-6 pb-4">
                {/* Encounter Type */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Encounter Type</h3>
                  </div>
                  <FormField
                    control={editEncounterForm.control}
                    name="encounterType"
                    render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="edit-select-encounter-type">
                              <SelectValue placeholder="Select encounter type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="office_visit">Office Visit</SelectItem>
                            <SelectItem value="telehealth">Telehealth</SelectItem>
                            <SelectItem value="phone">Phone Consultation</SelectItem>
                            <SelectItem value="follow_up">Follow Up</SelectItem>
                            <SelectItem value="urgent">Urgent Care</SelectItem>
                            <SelectItem value="annual_physical">Annual Physical</SelectItem>
                            <SelectItem value="procedure">Procedure</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Chief Complaint */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Chief Complaint</h3>
                  </div>
                  <FormField
                    control={editEncounterForm.control}
                    name="chiefComplaint"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea {...field} placeholder="Patient's primary complaint..." data-testid="edit-input-chief-complaint" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* HPI */}
                <Accordion type="single" collapsible defaultValue="hpi" className="w-full">
                  <AccordionItem value="hpi">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-semibold">History of Present Illness (HPI)</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <FormField
                        control={editEncounterForm.control}
                        name="hpiNarrative"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Narrative</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Free text description of the patient's history..." data-testid="edit-input-hpi-narrative" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={editEncounterForm.control}
                          name="hpiOnset"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Onset</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="When did it start?" data-testid="edit-input-hpi-onset" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editEncounterForm.control}
                          name="hpiLocation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Location</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Where is the symptom?" data-testid="edit-input-hpi-location" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editEncounterForm.control}
                          name="hpiDuration"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Duration</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="How long does it last?" data-testid="edit-input-hpi-duration" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={editEncounterForm.control}
                          name="hpiSeverity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Severity</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="How severe? (1-10)" data-testid="edit-input-hpi-severity" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <Separator />

                {/* Assessment & Plan */}
                <Accordion type="single" collapsible defaultValue="assessment" className="w-full">
                  <AccordionItem value="assessment">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" />
                        <span className="font-semibold">Assessment & Plan</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-4">
                      <FormField
                        control={editEncounterForm.control}
                        name="assessmentSummary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Assessment Summary</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Clinical impression, diagnosis..." data-testid="edit-input-assessment" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={editEncounterForm.control}
                        name="planSummary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plan Summary</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Treatment plan, follow-up..." data-testid="edit-input-plan" className="min-h-[100px]" />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </form>
            </Form>
          </ScrollArea>
          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditingEncounter(null)}>
              Cancel
            </Button>
            <Button 
              onClick={editEncounterForm.handleSubmit((data) => {
                if (editingEncounter) {
                  updateEncounterMutation.mutate({ id: editingEncounter.id, data });
                }
              })}
              disabled={updateEncounterMutation.isPending}
              data-testid="button-save-edit-encounter"
            >
              {updateEncounterMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
