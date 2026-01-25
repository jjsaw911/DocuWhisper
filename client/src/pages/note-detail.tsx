import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams } from "wouter";
import { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  Save,
  Loader2,
  Calendar,
  User,
  FileText,
  Clock,
  AudioLines,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Download,
  Share2,
  Wand2
} from "lucide-react";
import type { Note } from "@shared/schema";

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: note, isLoading } = useQuery<Note>({
    queryKey: ["/api/notes", id],
    enabled: !!user && !!id,
  });

  const [formData, setFormData] = useState({
    title: "",
    patientName: "",
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  });
  const [aiInstructions, setAiInstructions] = useState("");
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  useEffect(() => {
    if (note) {
      setFormData({
        title: note.title || "",
        patientName: note.patientName || "",
        subjective: note.subjective || "",
        objective: note.objective || "",
        assessment: note.assessment || "",
        plan: note.plan || "",
      });
    }
  }, [note]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/notes/${id}`, formData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({
        title: "Note updated",
        description: "Your changes have been saved",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update note",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/generate-soap", {
        transcript: note?.transcript || "",
        patientName: formData.patientName,
        specialty: note?.specialty || "general",
        aiInstructions: aiInstructions,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setFormData(prev => ({
        ...prev,
        subjective: data.subjective || "",
        objective: data.objective || "",
        assessment: data.assessment || "",
        plan: data.plan || "",
      }));
      toast({
        title: "SOAP note regenerated",
        description: "The note has been regenerated with your instructions",
      });
    },
    onError: () => {
      toast({
        title: "Failed to regenerate",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
      toast({
        title: "Copied",
        description: `${section} copied to clipboard`,
      });
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const copyFullNote = () => {
    const fullNote = `SOAP NOTE
${formData.patientName ? `Patient: ${formData.patientName}` : ""}
Date: ${note ? new Date(note.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}

SUBJECTIVE:
${formData.subjective || "Not documented"}

OBJECTIVE:
${formData.objective || "Not documented"}

ASSESSMENT:
${formData.assessment || "Not documented"}

PLAN:
${formData.plan || "Not documented"}`;
    
    copyToClipboard(fullNote, "Full note");
  };

  const exportToPDF = () => {
    const content = `
      <html>
        <head>
          <title>${formData.title || "SOAP Note"}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 10px; }
            h2 { color: #374151; margin-top: 24px; }
            .meta { color: #6b7280; margin-bottom: 24px; }
            .section { margin-bottom: 20px; }
            .section-title { font-weight: bold; color: #0d9488; margin-bottom: 8px; }
            .section-content { white-space: pre-wrap; line-height: 1.6; }
            .transcript { background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 32px; }
          </style>
        </head>
        <body>
          <h1>${formData.title || "SOAP Note"}</h1>
          <div class="meta">
            ${formData.patientName ? `<p>Patient: ${formData.patientName}</p>` : ""}
            <p>Date: ${note ? new Date(note.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</p>
          </div>
          
          <div class="section">
            <div class="section-title">SUBJECTIVE</div>
            <div class="section-content">${formData.subjective || "Not documented"}</div>
          </div>
          
          <div class="section">
            <div class="section-title">OBJECTIVE</div>
            <div class="section-content">${formData.objective || "Not documented"}</div>
          </div>
          
          <div class="section">
            <div class="section-title">ASSESSMENT</div>
            <div class="section-content">${formData.assessment || "Not documented"}</div>
          </div>
          
          <div class="section">
            <div class="section-title">PLAN</div>
            <div class="section-content">${formData.plan || "Not documented"}</div>
          </div>
          
          ${note?.transcript ? `
            <div class="transcript">
              <h2>Original Transcript</h2>
              <div class="section-content">${note.transcript}</div>
            </div>
          ` : ""}
        </body>
      </html>
    `;
    
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(content);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const shareNote = async () => {
    const shareText = `SOAP Note: ${formData.title}\n\nSubjective: ${formData.subjective?.substring(0, 100)}...`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: formData.title,
          text: shareText,
        });
      } catch {
        copyFullNote();
      }
    } else {
      copyFullNote();
    }
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-auto bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-10 w-64 mb-4" />
          <Skeleton className="h-6 w-48 mb-8" />
          <div className="space-y-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Note not found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This note may have been deleted or doesn't exist.
            </p>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex h-14 items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild data-testid="button-back">
              <Link href="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <span className="text-lg font-semibold truncate max-w-[300px]">
              {note.title}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={shareNote} data-testid="button-share">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={exportToPDF} data-testid="button-export">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={copyFullNote} data-testid="button-copy-all">
              {copiedSection === "Full note" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              data-testid="button-save"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {note.specialty && (
              <Badge variant="secondary">{note.specialty}</Badge>
            )}
            {note.patientName && (
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span>{note.patientName}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>{new Date(note.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{new Date(note.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        <Card data-testid="card-details" className="mb-6">
          <CardContent className="pt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                data-testid="input-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patientName">Patient Name</Label>
              <Input
                id="patientName"
                value={formData.patientName}
                onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
                data-testid="input-patient-name"
              />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-ai-instructions" className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              AI Instructions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Tell the AI what to include, omit, or modify. For example: 'Omit personal family history' or 'Focus more on the symptoms related to chest pain' or 'Add that patient has a history of diabetes'"
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              className="min-h-[80px]"
              data-testid="textarea-ai-instructions"
            />
            <Button 
              variant="secondary" 
              onClick={() => regenerateMutation.mutate()}
              disabled={regenerateMutation.isPending || !note.transcript}
              data-testid="button-regenerate"
            >
              {regenerateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate SOAP Note
                </>
              )}
            </Button>
            {!note.transcript && (
              <p className="text-xs text-muted-foreground">
                Regeneration requires a transcript. This note was created without one.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-soap" className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                SOAP Note
              </CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  const soapText = `Subjective:\n${formData.subjective}\n\nObjective:\n${formData.objective}\n\nAssessment:\n${formData.assessment}\n\nPlan:\n${formData.plan}`;
                  copyToClipboard(soapText, "SOAP Note");
                }}
                data-testid="button-copy-soap"
              >
                {copiedSection === "SOAP Note" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="subjective" className="text-base font-semibold">Subjective</Label>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(formData.subjective, "Subjective")}
                >
                  {copiedSection === "Subjective" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <Textarea
                id="subjective"
                value={formData.subjective}
                onChange={(e) => setFormData({ ...formData, subjective: e.target.value })}
                className="min-h-[120px]"
                placeholder="Patient's symptoms, complaints, and medical history as described by the patient..."
                data-testid="textarea-subjective"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="objective" className="text-base font-semibold">Objective</Label>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(formData.objective, "Objective")}
                >
                  {copiedSection === "Objective" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <Textarea
                id="objective"
                value={formData.objective}
                onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                className="min-h-[120px]"
                placeholder="Physical examination findings, vital signs, lab results..."
                data-testid="textarea-objective"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="assessment" className="text-base font-semibold">Assessment</Label>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(formData.assessment, "Assessment")}
                >
                  {copiedSection === "Assessment" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <Textarea
                id="assessment"
                value={formData.assessment}
                onChange={(e) => setFormData({ ...formData, assessment: e.target.value })}
                className="min-h-[120px]"
                placeholder="Diagnosis, clinical reasoning, differential diagnoses..."
                data-testid="textarea-assessment"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="plan" className="text-base font-semibold">Plan</Label>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => copyToClipboard(formData.plan, "Plan")}
                >
                  {copiedSection === "Plan" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <Textarea
                id="plan"
                value={formData.plan}
                onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                className="min-h-[120px]"
                placeholder="Treatment plan, medications, follow-up instructions..."
                data-testid="textarea-plan"
              />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-transcript">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AudioLines className="h-4 w-4 text-primary" />
                Original Transcript
              </CardTitle>
              {note.transcript && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => copyToClipboard(note.transcript || "", "Transcript")}
                  data-testid="button-copy-transcript"
                >
                  {copiedSection === "Transcript" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {note.transcript ? (
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{note.transcript}</p>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                <AudioLines className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No transcript available for this note</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
