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
  Wand2,
  ChevronDown,
  ChevronUp
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
    soapNote: "",
  });
  const [aiInstructions, setAiInstructions] = useState("");
  const [showAiInstructions, setShowAiInstructions] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatSoapNote = (note: Note) => {
    const parts = [];
    if (note.subjective) parts.push(`SUBJECTIVE:\n${note.subjective}`);
    if (note.objective) parts.push(`OBJECTIVE:\n${note.objective}`);
    if (note.assessment) parts.push(`ASSESSMENT:\n${note.assessment}`);
    if (note.plan) parts.push(`PLAN:\n${note.plan}`);
    return parts.join("\n\n");
  };

  const parseSoapNote = (text: string) => {
    const sections: { subjective: string; objective: string; assessment: string; plan: string } = {
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
    };

    const subjectiveMatch = text.match(/SUBJECTIVE:\s*([\s\S]*?)(?=OBJECTIVE:|ASSESSMENT:|PLAN:|$)/i);
    const objectiveMatch = text.match(/OBJECTIVE:\s*([\s\S]*?)(?=SUBJECTIVE:|ASSESSMENT:|PLAN:|$)/i);
    const assessmentMatch = text.match(/ASSESSMENT:\s*([\s\S]*?)(?=SUBJECTIVE:|OBJECTIVE:|PLAN:|$)/i);
    const planMatch = text.match(/PLAN:\s*([\s\S]*?)(?=SUBJECTIVE:|OBJECTIVE:|ASSESSMENT:|$)/i);

    if (subjectiveMatch) sections.subjective = subjectiveMatch[1].trim();
    if (objectiveMatch) sections.objective = objectiveMatch[1].trim();
    if (assessmentMatch) sections.assessment = assessmentMatch[1].trim();
    if (planMatch) sections.plan = planMatch[1].trim();

    return sections;
  };

  useEffect(() => {
    if (note) {
      setFormData({
        title: note.title || "",
        patientName: note.patientName || "",
        soapNote: formatSoapNote(note),
      });
    }
  }, [note]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const parsedSoap = parseSoapNote(formData.soapNote);
      const response = await apiRequest("PATCH", `/api/notes/${id}`, {
        title: formData.title,
        patientName: formData.patientName,
        ...parsedSoap,
      });
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
      const newSoapNote: string[] = [];
      if (data.subjective) newSoapNote.push(`SUBJECTIVE:\n${data.subjective}`);
      if (data.objective) newSoapNote.push(`OBJECTIVE:\n${data.objective}`);
      if (data.assessment) newSoapNote.push(`ASSESSMENT:\n${data.assessment}`);
      if (data.plan) newSoapNote.push(`PLAN:\n${data.plan}`);
      
      setFormData(prev => ({
        ...prev,
        soapNote: newSoapNote.join("\n\n"),
      }));
      setShowAiInstructions(false);
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied",
        description: "Note copied to clipboard",
      });
    } catch {
      toast({
        title: "Failed to copy",
        description: "Please try again",
        variant: "destructive",
      });
    }
  };

  const exportToPDF = () => {
    const content = `
      <html>
        <head>
          <title>${formData.title || "SOAP Note"}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { color: #0d9488; border-bottom: 2px solid #0d9488; padding-bottom: 10px; }
            .meta { color: #6b7280; margin-bottom: 24px; }
            .content { white-space: pre-wrap; line-height: 1.6; }
            .transcript { background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 32px; }
            .transcript h2 { margin-top: 0; }
          </style>
        </head>
        <body>
          <h1>${formData.title || "SOAP Note"}</h1>
          <div class="meta">
            ${formData.patientName ? `<p>Patient: ${formData.patientName}</p>` : ""}
            <p>Date: ${note ? new Date(note.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</p>
          </div>
          <div class="content">${formData.soapNote}</div>
          ${note?.transcript ? `
            <div class="transcript">
              <h2>Original Transcript</h2>
              <div class="content">${note.transcript}</div>
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
    if (navigator.share) {
      try {
        await navigator.share({
          title: formData.title,
          text: formData.soapNote,
        });
      } catch {
        copyToClipboard(formData.soapNote);
      }
    } else {
      copyToClipboard(formData.soapNote);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full overflow-auto bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-10 w-64 mb-4" />
          <Skeleton className="h-6 w-48 mb-8" />
          <Skeleton className="h-64 w-full" />
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
                  Save
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
                onClick={() => copyToClipboard(formData.soapNote)}
                data-testid="button-copy-soap"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={formData.soapNote}
              onChange={(e) => setFormData({ ...formData, soapNote: e.target.value })}
              className="min-h-[400px] font-mono text-sm"
              placeholder="SUBJECTIVE:&#10;Patient's symptoms...&#10;&#10;OBJECTIVE:&#10;Examination findings...&#10;&#10;ASSESSMENT:&#10;Diagnosis...&#10;&#10;PLAN:&#10;Treatment plan..."
              data-testid="textarea-soap"
            />
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAiInstructions(!showAiInstructions)}
              className="w-full"
              data-testid="button-toggle-ai"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              AI Instructions
              {showAiInstructions ? (
                <ChevronUp className="ml-2 h-4 w-4" />
              ) : (
                <ChevronDown className="ml-2 h-4 w-4" />
              )}
            </Button>

            {showAiInstructions && (
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <Textarea
                  placeholder="Tell the AI what to include, omit, or modify. For example: 'Omit personal family history' or 'Focus more on chest pain symptoms' or 'Add that patient has history of diabetes'"
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  className="min-h-[80px]"
                  data-testid="textarea-ai-instructions"
                />
                <Button 
                  variant="secondary" 
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending || !note.transcript}
                  className="w-full"
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
                  <p className="text-xs text-muted-foreground text-center">
                    Regeneration requires a transcript.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {note.transcript && (
          <Card data-testid="card-transcript">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <AudioLines className="h-4 w-4 text-primary" />
                  Original Transcript
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => copyToClipboard(note.transcript || "")}
                  data-testid="button-copy-transcript"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm whitespace-pre-wrap">{note.transcript}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
