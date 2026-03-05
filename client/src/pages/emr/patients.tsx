import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  User,
  Phone,
  Mail,
  Calendar,
  Users,
  Building2,
  Shield,
  AlertCircle,
  Pill,
} from "lucide-react";
import type { Patient } from "@shared/schema";
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

export default function PatientsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
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

  const { data: patients = [], isLoading } = useQuery<Patient[]>({
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

  // Show consent dialog if needed
  if (showConsentDialog && !emrAccess.consentAcknowledged) {
    return (
      <EmrConsentDialog 
        open={true} 
        onConsentGiven={() => setShowConsentDialog(false)} 
      />
    );
  }

  const filteredPatients = patients.filter((patient) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase();
    return (
      fullName.includes(searchLower) ||
      patient.email?.toLowerCase().includes(searchLower) ||
      patient.phone?.includes(search)
    );
  });

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Not set";
    return new Date(date).toLocaleDateString();
  };

  const getGenderLabel = (gender: string | null | undefined) => {
    const labels: Record<string, string> = {
      male: "Male",
      female: "Female",
      other: "Other",
      prefer_not_to_say: "Prefer not to say",
    };
    return labels[gender || ""] || "Not set";
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
              queryClient.invalidateQueries({ queryKey: ["/api/emr/patients", selectedOrgId] });
              setLocation("/emr/patients/" + patient.id);
            }}
            organizationId={selectedOrgId}
          />
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patients by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-patients"
          />
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredPatients.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredPatients.map((patient) => (
              <Link
                key={patient.id}
                href={`/emr/patients/${patient.id}`}
              >
                <Card
                  className="hover-elevate cursor-pointer h-full"
                  data-testid={`card-patient-${patient.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">
                        {patient.firstName} {patient.lastName}
                      </CardTitle>
                      {!patient.isActive && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {patient.dateOfBirth && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>DOB: {formatDate(patient.dateOfBirth)}</span>
                        </div>
                      )}
                      {patient.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <span>{patient.phone}</span>
                        </div>
                      )}
                      {patient.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <span className="truncate">{patient.email}</span>
                        </div>
                      )}
                      {patient.gender && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span>{getGenderLabel(patient.gender)}</span>
                        </div>
                      )}
                      {patient.insuranceProvider && (
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          <span className="truncate">{patient.insuranceProvider}</span>
                        </div>
                      )}
                    </div>
                    {(patient.allergies || patient.medications) && (
                      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t">
                        {patient.allergies && (() => {
                          try {
                            const parsed = JSON.parse(patient.allergies);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                              return (
                                <Badge variant="destructive" className="text-xs" data-testid={`badge-allergies-${patient.id}`}>
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  {parsed.length} {parsed.length === 1 ? 'Allergy' : 'Allergies'}
                                </Badge>
                              );
                            }
                          } catch {
                            if (patient.allergies.trim()) {
                              return (
                                <Badge variant="destructive" className="text-xs" data-testid={`badge-allergies-${patient.id}`}>
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Allergies noted
                                </Badge>
                              );
                            }
                          }
                          return null;
                        })()}
                        {patient.medications && (() => {
                          try {
                            const parsed = JSON.parse(patient.medications);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                              return (
                                <Badge variant="secondary" className="text-xs" data-testid={`badge-medications-${patient.id}`}>
                                  <Pill className="h-3 w-3 mr-1" />
                                  {parsed.length} {parsed.length === 1 ? 'Medication' : 'Medications'}
                                </Badge>
                              );
                            }
                          } catch {
                            if (patient.medications.trim()) {
                              return (
                                <Badge variant="secondary" className="text-xs" data-testid={`badge-medications-${patient.id}`}>
                                  <Pill className="h-3 w-3 mr-1" />
                                  Medications noted
                                </Badge>
                              );
                            }
                          }
                          return null;
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-12 pb-12 text-center">
              <Users className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {search ? "No patients found" : "No patients yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {search
                  ? "Try a different search term"
                  : "Add your first patient to get started"}
              </p>
              {!search && (
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
