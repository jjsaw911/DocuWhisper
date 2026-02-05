import { useState, useEffect } from "react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, User, Stethoscope, Globe, FileText, Save, Bell, Clock, Users, Plus, Trash2, UserPlus, Crown, Shield, Copy, IdCard, Building2, Mic } from "lucide-react";
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
import type { Template, UserSettings, Practice, PracticeMember } from "@shared/schema";
import { EMR_ROLES, type EmrRoleType } from "@shared/schema";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"
];

const SPECIALTIES = [
  "Primary Care",
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

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
  const [noiseThreshold, setNoiseThreshold] = useState(10);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [emailDigestTime, setEmailDigestTime] = useState("08:00");

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

  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  // Practices query
  const { data: practices = [], isLoading: practicesLoading } = useQuery<{ practice: Practice; role: string }[]>({
    queryKey: ["/api/practices"],
  });

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
      setNoiseThreshold(settings.noiseThreshold ?? 10);
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
        noiseThreshold,
        emailNotificationsEnabled,
        emailDigestTime,
        // EMR Credentials
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
