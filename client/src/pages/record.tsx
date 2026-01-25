import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { 
  Mic, 
  Square, 
  Loader2, 
  Stethoscope, 
  ArrowLeft, 
  FileText,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  LayoutTemplate
} from "lucide-react";

type RecordingState = "idle" | "recording" | "processing" | "complete" | "error";

type Template = {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean | null;
};

export default function Record() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [patientName, setPatientName] = useState("");
  const [specialty, setSpecialty] = useState("general");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [soapNote, setSoapNote] = useState<{
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const transcribeMutation = useMutation({
    mutationFn: async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("patientName", patientName);
      formData.append("specialty", specialty);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || "Transcription failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      setTranscript(data.transcript);
      setRecordingState("complete");
    },
    onError: (error: Error) => {
      setRecordingState("error");
      toast({
        title: "Transcription failed",
        description: error.message || "Please try recording again",
        variant: "destructive",
      });
    },
  });

  const generateSoapMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/generate-soap", {
        transcript,
        patientName,
        specialty,
        templateId: selectedTemplateId ? parseInt(selectedTemplateId) : undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setSoapNote(data);
    },
    onError: () => {
      toast({
        title: "SOAP generation failed",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/notes", {
        title: patientName ? `${patientName} - ${new Date().toLocaleDateString()}` : `Consultation - ${new Date().toLocaleDateString()}`,
        patientName,
        specialty,
        transcript,
        subjective: soapNote?.subjective || "",
        objective: soapNote?.objective || "",
        assessment: soapNote?.assessment || "",
        plan: soapNote?.plan || "",
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({
        title: "Note saved",
        description: "Your consultation has been saved successfully",
      });
      navigate(`/notes/${data.id}`);
    },
    onError: () => {
      toast({
        title: "Failed to save note",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        setRecordingState("processing");
        transcribeMutation.mutate(blob);
      };

      mediaRecorder.start(100);
      setRecordingState("recording");
    } catch (error) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to record consultations",
        variant: "destructive",
      });
    }
  }, [transcribeMutation, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild data-testid="button-back">
                <Link href="/">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
                  <Stethoscope className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-semibold tracking-tight">New Recording</span>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
        <div className="space-y-6">
          <Card data-testid="card-patient-info">
            <CardHeader>
              <CardTitle>Consultation Details</CardTitle>
              <CardDescription>Optional information about the consultation</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="patientName">Patient Name (Optional)</Label>
                <Input
                  id="patientName"
                  placeholder="Enter patient name"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  disabled={recordingState === "recording" || recordingState === "processing"}
                  data-testid="input-patient-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialty">Specialty</Label>
                <Select 
                  value={specialty} 
                  onValueChange={setSpecialty}
                  disabled={recordingState === "recording" || recordingState === "processing"}
                >
                  <SelectTrigger id="specialty" data-testid="select-specialty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Practice</SelectItem>
                    <SelectItem value="cardiology">Cardiology</SelectItem>
                    <SelectItem value="pediatrics">Pediatrics</SelectItem>
                    <SelectItem value="psychiatry">Psychiatry</SelectItem>
                    <SelectItem value="orthopedics">Orthopedics</SelectItem>
                    <SelectItem value="dermatology">Dermatology</SelectItem>
                    <SelectItem value="neurology">Neurology</SelectItem>
                    <SelectItem value="internal">Internal Medicine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template">Template (Optional)</Label>
                <Select 
                  value={selectedTemplateId || "default"} 
                  onValueChange={(value) => setSelectedTemplateId(value === "default" ? "" : value)}
                  disabled={recordingState === "recording" || recordingState === "processing"}
                >
                  <SelectTrigger id="template" data-testid="select-template">
                    <SelectValue placeholder="Default template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default template</SelectItem>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name}
                        {template.isDefault && " (Default)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templates.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    <Link href="/templates" className="text-primary hover:underline">Create templates</Link> to customize SOAP notes
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-recording">
            <CardHeader>
              <CardTitle>Voice Recording</CardTitle>
              <CardDescription>
                {recordingState === "idle" && "Click the microphone to start recording your consultation"}
                {recordingState === "recording" && "Recording in progress... Click to stop"}
                {recordingState === "processing" && "Processing your recording..."}
                {recordingState === "complete" && "Recording complete! Review your transcript below"}
                {recordingState === "error" && "An error occurred. Please try again"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center py-8">
              <div className="relative">
                {recordingState === "recording" && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-destructive/20 animate-pulse-ring" />
                    <div className="absolute inset-0 rounded-full bg-destructive/10 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
                  </>
                )}
                <Button
                  size="lg"
                  variant={recordingState === "recording" ? "destructive" : "default"}
                  className="h-24 w-24 rounded-full relative z-10"
                  onClick={recordingState === "recording" ? stopRecording : startRecording}
                  disabled={recordingState === "processing"}
                  data-testid="button-record"
                >
                  {recordingState === "processing" ? (
                    <Loader2 className="h-10 w-10 animate-spin" />
                  ) : recordingState === "recording" ? (
                    <Square className="h-10 w-10" />
                  ) : (
                    <Mic className="h-10 w-10" />
                  )}
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {recordingState === "idle" && "Tap to start"}
                {recordingState === "recording" && "Tap to stop"}
                {recordingState === "processing" && "Transcribing..."}
              </p>
            </CardContent>
          </Card>

          {(recordingState === "complete" || transcript) && (
            <Card data-testid="card-transcript">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    Transcript
                  </CardTitle>
                  <CardDescription>Review and edit the transcription</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  className="min-h-[200px] resize-none"
                  placeholder="Transcription will appear here..."
                  data-testid="textarea-transcript"
                />
              </CardContent>
            </Card>
          )}

          {transcript && !soapNote && (
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={() => generateSoapMutation.mutate()}
                disabled={generateSoapMutation.isPending}
                data-testid="button-generate-soap"
              >
                {generateSoapMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating SOAP Note...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate SOAP Note
                  </>
                )}
              </Button>
            </div>
          )}

          {soapNote && (
            <>
              <Card data-testid="card-soap-note">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    SOAP Note
                  </CardTitle>
                  <CardDescription>AI-generated clinical documentation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Subjective</Label>
                    <Textarea
                      value={soapNote.subjective}
                      onChange={(e) => setSoapNote({ ...soapNote, subjective: e.target.value })}
                      className="min-h-[100px]"
                      data-testid="textarea-subjective"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Objective</Label>
                    <Textarea
                      value={soapNote.objective}
                      onChange={(e) => setSoapNote({ ...soapNote, objective: e.target.value })}
                      className="min-h-[100px]"
                      data-testid="textarea-objective"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Assessment</Label>
                    <Textarea
                      value={soapNote.assessment}
                      onChange={(e) => setSoapNote({ ...soapNote, assessment: e.target.value })}
                      className="min-h-[100px]"
                      data-testid="textarea-assessment"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Plan</Label>
                    <Textarea
                      value={soapNote.plan}
                      onChange={(e) => setSoapNote({ ...soapNote, plan: e.target.value })}
                      className="min-h-[100px]"
                      data-testid="textarea-plan"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-3">
                <Button variant="outline" asChild data-testid="button-cancel">
                  <Link href="/">Cancel</Link>
                </Button>
                <Button 
                  onClick={() => saveNoteMutation.mutate()}
                  disabled={saveNoteMutation.isPending}
                  data-testid="button-save-note"
                >
                  {saveNoteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Save Note
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
