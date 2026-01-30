import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Plus,
  Calendar,
  Clock,
  User,
  MapPin,
  CalendarDays,
  Building2,
  Shield,
} from "lucide-react";
import type { Appointment, Patient } from "@shared/schema";

interface Practice {
  id: number;
  name: string;
  hasEmrLicense: boolean;
}

interface OrgAccess {
  practice: Practice;
  emrRole: string | null;
}

interface EmrAccessResponse {
  hasAccess: boolean;
  consentAcknowledged: boolean;
  consentDate?: string;
  accessType?: "vendor" | "organization" | "individual" | "none";
  organizations?: OrgAccess[];
}

const createAppointmentSchema = z.object({
  patientId: z.number({ required_error: "Patient is required" }),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  appointmentType: z.enum(["general", "follow_up", "initial", "urgent", "telehealth"]).optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

type CreateAppointmentFormData = z.infer<typeof createAppointmentSchema>;

export default function SchedulePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);

  const { data: emrAccess, isLoading: isCheckingAccess } = useQuery<EmrAccessResponse>({
    queryKey: ["/api/emr/access"],
  });

  const isVendor = emrAccess?.accessType === "vendor";
  const emrOrganizations = emrAccess?.organizations?.filter(org => org.practice?.hasEmrLicense).map(org => org.practice) || [];

  useEffect(() => {
    if (!isCheckingAccess && emrAccess && !emrAccess.hasAccess) {
      toast({
        title: "Access Denied",
        description: "You don't have access to the EMR system. Please contact your administrator.",
        variant: "destructive",
      });
      setLocation("/");
    }
    if (!isCheckingAccess && emrAccess?.hasAccess && !emrAccess.consentAcknowledged) {
      setShowConsentDialog(true);
    }
    if (!isCheckingAccess && emrAccess?.hasAccess && emrOrganizations.length > 0 && !selectedOrgId) {
      setSelectedOrgId(emrOrganizations[0].id);
    }
  }, [emrAccess, isCheckingAccess, setLocation, toast, emrOrganizations, selectedOrgId]);

  const { data: appointments = [], isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/emr/appointments", selectedOrgId],
    queryFn: async () => {
      const url = selectedOrgId 
        ? `/api/emr/appointments?organizationId=${selectedOrgId}` 
        : "/api/emr/appointments";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch appointments");
      return response.json();
    },
    enabled: emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true && (isVendor ? selectedOrgId !== null : true),
  });

  const { data: upcomingAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/emr/appointments/upcoming", selectedOrgId],
    queryFn: async () => {
      const url = selectedOrgId 
        ? `/api/emr/appointments/upcoming?organizationId=${selectedOrgId}` 
        : "/api/emr/appointments/upcoming";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch appointments");
      return response.json();
    },
    enabled: emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true && (isVendor ? selectedOrgId !== null : true),
  });

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ["/api/emr/patients", selectedOrgId],
    queryFn: async () => {
      const url = selectedOrgId 
        ? `/api/emr/patients?organizationId=${selectedOrgId}` 
        : "/api/emr/patients";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch patients");
      return response.json();
    },
    enabled: emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true && (isVendor ? selectedOrgId !== null : true),
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

  const form = useForm<CreateAppointmentFormData>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      title: "",
      description: "",
      startTime: "",
      endTime: "",
      appointmentType: "general",
      location: "",
      notes: "",
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: CreateAppointmentFormData) => {
      const response = await apiRequest("POST", "/api/emr/appointments", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/appointments"] });
      toast({
        title: "Appointment created",
        description: "New appointment has been scheduled",
      });
      form.reset();
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create appointment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await apiRequest("PATCH", `/api/emr/appointments/${id}`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/appointments"] });
      toast({
        title: "Appointment updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update appointment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatDateTime = (date: Date | string) => {
    return new Date(date).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getPatientName = (patientId: number) => {
    const patient = patients.find((p) => p.id === patientId);
    return patient ? `${patient.firstName} ${patient.lastName}` : "Unknown";
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-blue-500/10 text-blue-600",
      confirmed: "bg-green-500/10 text-green-600",
      completed: "bg-gray-500/10 text-gray-600",
      cancelled: "bg-red-500/10 text-red-600",
      no_show: "bg-orange-500/10 text-orange-600",
    };
    return colors[status] || colors.scheduled;
  };

  const getTypeLabel = (type: string | null | undefined) => {
    const labels: Record<string, string> = {
      general: "General",
      follow_up: "Follow-up",
      initial: "Initial Visit",
      urgent: "Urgent",
      telehealth: "Telehealth",
    };
    return labels[type || "general"] || "General";
  };

  // Group appointments by date
  const groupedAppointments: Record<string, Appointment[]> = {};
  appointments.forEach((apt) => {
    const date = new Date(apt.startTime).toLocaleDateString();
    if (!groupedAppointments[date]) {
      groupedAppointments[date] = [];
    }
    groupedAppointments[date].push(apt);
  });

  // Sort dates
  const sortedDates = Object.keys(groupedAppointments).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-6xl mx-auto">
        {isVendor && emrOrganizations.length > 0 && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg border flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Vendor View</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedOrgId?.toString() || ""}
                onValueChange={(value) => setSelectedOrgId(parseInt(value))}
              >
                <SelectTrigger className="w-[250px]" data-testid="select-organization">
                  <SelectValue placeholder="Select organization..." />
                </SelectTrigger>
                <SelectContent>
                  {emrOrganizations.map((org) => (
                    <SelectItem key={org.id} value={org.id.toString()}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">Schedule</h1>
            <p className="text-muted-foreground">
              Manage patient appointments
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-appointment">
                <Plus className="h-4 w-4 mr-2" />
                New Appointment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Schedule Appointment</DialogTitle>
                <DialogDescription>
                  Create a new appointment for a patient.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit((data) =>
                    createAppointmentMutation.mutate(data)
                  )}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="patientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Patient</FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(parseInt(val))}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-patient">
                              <SelectValue placeholder="Select a patient" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {patients.map((patient) => (
                              <SelectItem
                                key={patient.id}
                                value={patient.id.toString()}
                              >
                                {patient.firstName} {patient.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Follow-up Visit"
                            {...field}
                            data-testid="input-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Time</FormLabel>
                          <FormControl>
                            <Input
                              type="datetime-local"
                              {...field}
                              data-testid="input-start-time"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="endTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Time</FormLabel>
                          <FormControl>
                            <Input
                              type="datetime-local"
                              {...field}
                              data-testid="input-end-time"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="appointmentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="general">General</SelectItem>
                            <SelectItem value="initial">Initial Visit</SelectItem>
                            <SelectItem value="follow_up">Follow-up</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="telehealth">Telehealth</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Room 101"
                            {...field}
                            data-testid="input-location"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional notes..."
                            {...field}
                            data-testid="input-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={createAppointmentMutation.isPending}
                      data-testid="button-submit-appointment"
                    >
                      {createAppointmentMutation.isPending
                        ? "Creating..."
                        : "Create Appointment"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Upcoming appointments summary */}
        {upcomingAppointments.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Upcoming This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {upcomingAppointments.slice(0, 5).map((apt) => (
                  <div
                    key={apt.id}
                    className="flex-shrink-0 p-3 rounded-lg border bg-muted/30 min-w-[200px]"
                  >
                    <p className="font-medium truncate">{apt.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {getPatientName(apt.patientId)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(apt.startTime)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sortedDates.length > 0 ? (
          <div className="space-y-6">
            {sortedDates.map((date) => (
              <div key={date}>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {new Date(date).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
                <div className="space-y-3">
                  {groupedAppointments[date]
                    .sort(
                      (a, b) =>
                        new Date(a.startTime).getTime() -
                        new Date(b.startTime).getTime()
                    )
                    .map((apt) => (
                      <Card
                        key={apt.id}
                        className="hover-elevate"
                        data-testid={`card-appointment-${apt.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium">{apt.title}</span>
                                <Badge
                                  variant="secondary"
                                  className={getStatusColor(apt.status)}
                                >
                                  {apt.status}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3" />
                                  {getPatientName(apt.patientId)}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3 w-3" />
                                  {formatTime(apt.startTime)} -{" "}
                                  {formatTime(apt.endTime)}
                                </div>
                                {apt.location && (
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-3 w-3" />
                                    {apt.location}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {apt.status === "scheduled" && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      updateAppointmentMutation.mutate({
                                        id: apt.id,
                                        status: "confirmed",
                                      })
                                    }
                                    data-testid={`button-confirm-${apt.id}`}
                                  >
                                    Confirm
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      updateAppointmentMutation.mutate({
                                        id: apt.id,
                                        status: "completed",
                                      })
                                    }
                                    data-testid={`button-complete-${apt.id}`}
                                  >
                                    Complete
                                  </Button>
                                </>
                              )}
                              {apt.status === "confirmed" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    updateAppointmentMutation.mutate({
                                      id: apt.id,
                                      status: "completed",
                                    })
                                  }
                                  data-testid={`button-complete-${apt.id}`}
                                >
                                  Mark Complete
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-12 pb-12 text-center">
              <CalendarDays className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No appointments yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Schedule your first appointment to get started
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New Appointment
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
