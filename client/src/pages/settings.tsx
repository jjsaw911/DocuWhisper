import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, User, Stethoscope, Globe, FileText, Save, Bell, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Template, UserSettings } from "@shared/schema";

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
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [emailDigestTime, setEmailDigestTime] = useState("08:00");

  const { data: settings, isLoading: settingsLoading } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
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
      setEmailNotificationsEnabled(settings.emailNotificationsEnabled ?? false);
      setEmailDigestTime(settings.emailDigestTime || "08:00");
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
        emailNotificationsEnabled,
        emailDigestTime,
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
                <div>
                  <p className="font-medium">{user?.email}</p>
                  <p className="text-sm text-muted-foreground">Account email</p>
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
        </div>
      </div>
    </div>
  );
}
