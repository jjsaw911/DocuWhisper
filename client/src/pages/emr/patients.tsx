import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmrConsentDialog } from "@/components/emr-consent-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Users,
  Building2,
  Shield,
} from "lucide-react";
import type { Patient, Appointment } from "@shared/schema";
import { PatientIntakeWizard } from "@/components/emr/patient-intake-wizard";

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

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  initial: "New Patient",
  follow_up: "Follow-up",
  urgent: "Sick/Urgent",
  general: "General",
  telehealth: "Telehealth",
};

export default function PatientsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);

  const [showConsentDialog, setShowConsentDialog] = useState(false);
  
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

  const trimmedSearchInput = searchInput.trim();
  const trimmedSearch = activeSearch.trim();

  const { data: recentPatients = [], isLoading: isLoadingRecent } = useQuery<Patient[]>({
    queryKey: ["/api/emr/patients/recent", selectedOrgId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("seenWithinDays", "2");
      if (selectedOrgId) {
        params.set("organizationId", selectedOrgId.toString());
      }
      const url = `/api/emr/patients?${params.toString()}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch patients");
      return response.json();
    },
    enabled: emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true && (isVendor ? selectedOrgId !== null : true),
  });

  const { data: searchedPatients = [], isLoading: isSearching } = useQuery<Patient[]>({
    queryKey: ["/api/emr/patients/search", selectedOrgId, trimmedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("q", trimmedSearch);
      if (selectedOrgId) {
        params.set("organizationId", selectedOrgId.toString());
      }
      const response = await fetch(`/api/emr/patients/search?${params.toString()}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to search patients");
      return response.json();
    },
    enabled:
      emrAccess?.hasAccess === true &&
      emrAccess?.consentAcknowledged === true &&
      trimmedSearch.length > 0 &&
      (isVendor ? selectedOrgId !== null : true),
  });

  const { data: appointments = [] } = useQuery<Appointment[]>({
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

  if (isCheckingAccess || !emrAccess?.hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  // Show consent dialog if needed
  if (showConsentDialog && !emrAccess.consentAcknowledged) {
    return (
      <EmrConsentDialog 
        open={true} 
        onConsentGiven={() => setShowConsentDialog(false)} 
      />
    );
  }

  const isSearchMode = trimmedSearch.length > 0;
  const displayedPatients = isSearchMode ? searchedPatients : recentPatients;
  const isPatientsLoading = isSearchMode ? isSearching : isLoadingRecent;

  const runSearch = () => {
    setActiveSearch(trimmedSearchInput);
  };

  const latestAppointmentByPatient = useMemo(() => {
    const map = new Map<number, Appointment>();
    for (const appointment of appointments) {
      const existing = map.get(appointment.patientId);
      if (!existing) {
        map.set(appointment.patientId, appointment);
        continue;
      }
      const existingTime = existing.startTime ? new Date(existing.startTime).getTime() : 0;
      const nextTime = appointment.startTime ? new Date(appointment.startTime).getTime() : 0;
      if (nextTime > existingTime) {
        map.set(appointment.patientId, appointment);
      }
    }
    return map;
  }, [appointments]);

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Not set";
    return new Date(date).toLocaleDateString();
  };

  const formatChartNumber = (patientId: number) => `CH-${patientId.toString().padStart(6, "0")}`;

  const getPatientType = (patient: Patient) => {
    const appointmentType = latestAppointmentByPatient.get(patient.id)?.appointmentType || "";
    if (appointmentType) {
      return APPOINTMENT_TYPE_LABELS[appointmentType] || appointmentType;
    }

    if (patient.createdAt) {
      const ageMs = Date.now() - new Date(patient.createdAt).getTime();
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
      if (ageMs <= fourteenDaysMs) {
        return "New Patient";
      }
    }

    return "Unspecified";
  };

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
            <h1 className="text-2xl font-bold">Patients</h1>
            <p className="text-muted-foreground">
              Manage your patient records
            </p>
          </div>
          <Button data-testid="button-add-patient" onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Patient
          </Button>
          <PatientIntakeWizard
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            onPatientCreated={(patient) => {
              queryClient.invalidateQueries({ queryKey: ["/api/emr/patients"] });
              queryClient.invalidateQueries({ queryKey: ["/api/emr/patients/recent", selectedOrgId] });
              queryClient.invalidateQueries({ queryKey: ["/api/emr/patients/search", selectedOrgId] });
              setLocation("/emr/patients/" + patient.id);
            }}
            organizationId={selectedOrgId}
          />
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search all patients by name, email, or phone..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  runSearch();
                }
              }}
              className="pl-10"
              data-testid="input-search-patients"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={runSearch}
            data-testid="button-search-patients"
          >
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
          {isSearchMode && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchInput("");
                setActiveSearch("");
              }}
              data-testid="button-clear-search-patients"
            >
              Clear
            </Button>
          )}
        </div>

        {trimmedSearchInput !== trimmedSearch && (
          <p className="text-xs text-muted-foreground mb-3">
            Press Search to run your updated query.
          </p>
        )}

        <p className="text-sm text-muted-foreground mb-4">
          {isSearchMode
            ? `Showing search results for "${trimmedSearch}"`
            : "Showing patients seen in the last 2 days. Search to find older patient records."}
        </p>

        {isPatientsLoading ? (
          <div className="border border-border">
            <div className="max-h-[62vh] overflow-y-auto">
              <table className="w-full border-collapse table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-muted/30">
                  <tr>
                    <th className="w-[42%] border-b border-r px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Patient Name</th>
                    <th className="w-[34%] border-b border-r px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Chart # / DOB</th>
                    <th className="w-[24%] border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(6)].map((_, i) => (
                    <tr key={i}>
                      <td className="border-b border-r px-3 py-2"><Skeleton className="h-4 w-40" /></td>
                      <td className="border-b border-r px-3 py-2"><Skeleton className="h-4 w-44" /></td>
                      <td className="border-b px-3 py-2"><Skeleton className="h-4 w-28" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : displayedPatients.length > 0 ? (
          <div className="border border-border">
            <div className="max-h-[62vh] overflow-y-auto">
              <table className="w-full border-collapse table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-muted/30">
                  <tr>
                    <th className="w-[42%] border-b border-r px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Patient Name</th>
                    <th className="w-[34%] border-b border-r px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Chart # / DOB</th>
                    <th className="w-[24%] border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedPatients.map((patient) => (
                    <tr
                      key={patient.id}
                      className="cursor-pointer hover:bg-muted/20"
                      data-testid={`row-patient-${patient.id}`}
                      onClick={() => setLocation(`/emr/patients/${patient.id}`)}
                    >
                      <td className="border-b border-r px-3 py-2 font-medium">
                        {patient.lastName}, {patient.firstName}
                      </td>
                      <td className="border-b border-r px-3 py-2">
                        <div className="text-xs font-mono">{formatChartNumber(patient.id)}</div>
                        <div className="text-xs text-muted-foreground">
                          DOB: {patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "Not set"}
                        </div>
                      </td>
                      <td className="border-b px-3 py-2 text-xs">
                        {getPatientType(patient)}{!patient.isActive ? " • Inactive" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-12 pb-12 text-center">
              <Users className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {isSearchMode ? "No patients found" : "No recent patients"}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {isSearchMode
                  ? "Try a different search term."
                  : "No patients were seen in the last 2 days. Use search to find older records."}
              </p>
              {!isSearchMode && (
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Patient
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
