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

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const patientId = parseInt(id || "0");
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showVitalsForm, setShowVitalsForm] = useState(false);

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
      <div className="flex-1 overflow-auto p-6">
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
      <div className="flex-1 overflow-auto p-6">
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
    <div className="flex-1 overflow-auto p-6">
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

          <TabsContent value="encounters">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
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
                    toast({
                      title: "Coming Soon",
                      description: "Encounter creation will be available in a future update",
                    });
                  }}
                  data-testid="button-new-encounter"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Encounter
                </Button>
              </CardHeader>
              <CardContent>
                {patientEncounters.length > 0 ? (
                  <div className="space-y-4">
                    {patientEncounters.map((enc) => (
                      <div
                        key={enc.id}
                        className="p-4 border rounded-lg"
                        data-testid={`encounter-${enc.id}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-medium">{formatDate(enc.encounterDate)}</span>
                              <Badge variant={enc.status === "signed" ? "default" : "secondary"}>
                                {enc.status === "signed" ? "Signed" : enc.status === "completed" ? "Completed" : "In Progress"}
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
    </div>
  );
}
