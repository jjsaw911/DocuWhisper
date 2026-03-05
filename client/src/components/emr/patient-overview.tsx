import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Calendar,
  User,
  Phone,
  Shield,
  Activity,
  Stethoscope,
  Pill,
  Heart,
  Thermometer,
  Weight,
  Droplet,
  CheckCircle,
  AlertCircle,
  CalendarDays,
  ClipboardList,
  Plus,
} from "lucide-react";
import type {
  Patient,
  Note,
  Appointment,
  PatientVitals,
  PatientEncounter,
} from "@shared/schema";

interface PatientOverviewProps {
  patient: Patient;
  vitals: PatientVitals[];
  encounters: PatientEncounter[];
  notes: Note[];
  appointments: Appointment[];
  onRecordVitals: () => void;
  onNewEncounter: () => void;
  onNavigate: (path: string) => void;
}

function calculateAge(dateOfBirth: Date | string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

interface StructuredAllergy {
  name: string;
  type?: string;
  severity?: string;
  reaction?: string;
}

interface StructuredMedication {
  name: string;
  dose?: string;
  frequency?: string;
  route?: string;
  status?: string;
}

function parseAllergies(value: string | null | undefined): { items: StructuredAllergy[]; isStructured: boolean } {
  if (!value || !value.trim()) return { items: [], isStructured: false };
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return { items: parsed, isStructured: true };
    }
  } catch {}
  return {
    items: value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(name => ({ name })),
    isStructured: false,
  };
}

function parseMedications(value: string | null | undefined): { items: StructuredMedication[]; isStructured: boolean } {
  if (!value || !value.trim()) return { items: [], isStructured: false };
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return { items: parsed, isStructured: true };
    }
  } catch {}
  return {
    items: value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).map(name => ({ name })),
    isStructured: false,
  };
}

function getSeverityVariant(severity?: string): "destructive" | "default" | "secondary" | "outline" {
  switch (severity) {
    case "severe": return "destructive";
    case "moderate": return "default";
    case "mild": return "secondary";
    default: return "outline";
  }
}

function getEncounterTypeLabel(type: string | null): string {
  const map: Record<string, string> = {
    office_visit: "Office Visit",
    telehealth: "Telehealth",
    phone: "Phone",
    follow_up: "Follow-Up",
    urgent: "Urgent",
  };
  return map[type || ""] || type || "Visit";
}

function getStatusVariant(
  status: string | null
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "completed":
    case "signed":
      return "default";
    case "in_progress":
      return "secondary";
    case "pending_cosign":
      return "outline";
    default:
      return "secondary";
  }
}

export default function PatientOverview({
  patient,
  vitals,
  encounters,
  notes,
  appointments,
  onRecordVitals,
  onNewEncounter,
  onNavigate,
}: PatientOverviewProps) {
  const age = calculateAge(patient.dateOfBirth);
  const { items: allergies } = parseAllergies(patient.allergies);
  const { items: medications } = parseMedications(patient.medications);
  const latestVitals = vitals.length > 0 ? vitals[0] : null;
  const recentEncounters = encounters.slice(0, 3);

  const now = new Date();
  const upcomingAppointment = appointments.find(
    (a) => a.status === "scheduled" && new Date(a.startTime) > now
  );

  const bpChartData =
    vitals.length >= 3
      ? vitals
          .slice(0, 10)
          .reverse()
          .filter((v) => v.bloodPressureSystolic != null)
          .map((v) => ({
            date: new Date(v.recordedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
            systolic: v.bloodPressureSystolic,
          }))
      : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-age">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Age</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-age">
              {age !== null ? `${age} yrs` : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-dob">
              {patient.dateOfBirth
                ? `DOB: ${new Date(patient.dateOfBirth).toLocaleDateString()}`
                : "DOB not recorded"}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-gender">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gender</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize" data-testid="text-gender">
              {patient.gender || "Not specified"}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-phone">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Phone</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {patient.phone ? (
              <a
                href={`tel:${patient.phone}`}
                className="text-2xl font-bold hover:underline"
                data-testid="link-phone"
              >
                {patient.phone}
              </a>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground" data-testid="text-no-phone">
                No phone
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-insurance">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Insurance</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-insurance">
              {patient.insuranceProvider || "No insurance on file"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-quick-actions">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-row flex-wrap gap-3">
            <Button onClick={onRecordVitals} data-testid="button-record-vitals">
              <Activity className="mr-2 h-4 w-4" />
              Record Vitals
            </Button>
            <Button onClick={onNewEncounter} data-testid="button-new-encounter">
              <Plus className="mr-2 h-4 w-4" />
              New Encounter
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate("/emr/schedule")}
              data-testid="button-view-schedule"
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              View Schedule
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card data-testid="card-allergies">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Allergies</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {allergies.length > 0 ? (
                <div className="flex flex-wrap gap-2" data-testid="list-allergies">
                  {allergies.map((allergy, i) => (
                    <Badge
                      key={i}
                      variant={getSeverityVariant(allergy.severity)}
                      data-testid={`badge-allergy-${i}`}
                    >
                      {allergy.name}
                      {allergy.severity && (
                        <span className="ml-1 opacity-75">({allergy.severity})</span>
                      )}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground" data-testid="text-no-allergies">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  No known allergies
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-medications">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current Medications</CardTitle>
              <Pill className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {medications.length > 0 ? (
                <ul className="space-y-2" data-testid="list-medications">
                  {medications.map((med, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 text-sm"
                      data-testid={`text-medication-${i}`}
                    >
                      <Pill className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">{med.name}</span>
                      {med.dose && <span className="text-muted-foreground">{med.dose}</span>}
                      {med.frequency && <span className="text-muted-foreground">· {med.frequency}</span>}
                      {med.status === "discontinued" && (
                        <Badge variant="secondary" className="text-xs">Discontinued</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-muted-foreground text-sm" data-testid="text-no-medications">
                  No active medications
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card data-testid="card-latest-vitals">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Latest Vitals</CardTitle>
              <Heart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {latestVitals ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div data-testid="text-bp">
                      <p className="text-xs text-muted-foreground">Blood Pressure</p>
                      <p className="text-lg font-semibold">
                        {latestVitals.bloodPressureSystolic != null &&
                        latestVitals.bloodPressureDiastolic != null
                          ? `${latestVitals.bloodPressureSystolic}/${latestVitals.bloodPressureDiastolic}`
                          : "—"}
                      </p>
                    </div>
                    <div data-testid="text-hr">
                      <p className="text-xs text-muted-foreground">Heart Rate</p>
                      <p className="text-lg font-semibold">
                        {latestVitals.heartRate != null
                          ? `${latestVitals.heartRate} bpm`
                          : "—"}
                      </p>
                    </div>
                    <div data-testid="text-temp">
                      <p className="text-xs text-muted-foreground">Temperature</p>
                      <p className="text-lg font-semibold">
                        {latestVitals.temperature
                          ? `${latestVitals.temperature}°${latestVitals.temperatureUnit || "F"}`
                          : "—"}
                      </p>
                    </div>
                    <div data-testid="text-spo2">
                      <p className="text-xs text-muted-foreground">SpO2</p>
                      <p className="text-lg font-semibold">
                        {latestVitals.oxygenSaturation != null
                          ? `${latestVitals.oxygenSaturation}%`
                          : "—"}
                      </p>
                    </div>
                    <div data-testid="text-weight">
                      <p className="text-xs text-muted-foreground">Weight</p>
                      <p className="text-lg font-semibold">
                        {latestVitals.weight
                          ? `${latestVitals.weight} ${latestVitals.weightUnit || "lbs"}`
                          : "—"}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recorded {new Date(latestVitals.recordedAt).toLocaleString()}
                  </p>

                  {bpChartData.length >= 3 && (
                    <div data-testid="chart-bp-trend">
                      <p className="text-xs text-muted-foreground mb-1">
                        BP Systolic Trend
                      </p>
                      <ResponsiveContainer width="100%" height={80}>
                        <LineChart data={bpChartData}>
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            hide
                            domain={["dataMin - 10", "dataMax + 10"]}
                          />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="systolic"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground text-sm" data-testid="text-no-vitals">
                  <Activity className="h-4 w-4" />
                  No vitals recorded yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-recent-encounters">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Encounters</CardTitle>
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {recentEncounters.length > 0 ? (
                <div className="space-y-3" data-testid="list-encounters">
                  {recentEncounters.map((enc) => (
                    <div
                      key={enc.id}
                      className="flex flex-col gap-1 rounded-md border p-3"
                      data-testid={`card-encounter-${enc.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">
                          {new Date(enc.encounterDate).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {getEncounterTypeLabel(enc.encounterType)}
                          </Badge>
                          <Badge
                            variant={getStatusVariant(enc.status)}
                            className="text-xs capitalize"
                          >
                            {enc.status?.replace(/_/g, " ") || "unknown"}
                          </Badge>
                        </div>
                      </div>
                      {enc.chiefComplaint && (
                        <p className="text-sm truncate" data-testid={`text-complaint-${enc.id}`}>
                          {enc.chiefComplaint}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground text-sm" data-testid="text-no-encounters">
                  <ClipboardList className="h-4 w-4" />
                  No encounters recorded yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card data-testid="card-upcoming-appointment">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Upcoming Appointment</CardTitle>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {upcomingAppointment ? (
            <div className="flex items-center gap-4 flex-wrap" data-testid="text-upcoming-appointment">
              <div>
                <p className="font-semibold">{upcomingAppointment.title}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(upcomingAppointment.startTime).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm" data-testid="text-no-upcoming">
              No upcoming appointments
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
