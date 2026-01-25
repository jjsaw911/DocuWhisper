import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { Link, useParams, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { 
  ArrowLeft, 
  Stethoscope, 
  Save,
  Loader2,
  Calendar,
  User,
  FileText,
  Clock
} from "lucide-react";
import type { Note } from "@shared/schema";

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
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
        <div className="mb-8">
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

        <div className="space-y-6">
          <Card data-testid="card-details">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
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

          <Card data-testid="card-soap">
            <CardHeader>
              <CardTitle>SOAP Note</CardTitle>
              <CardDescription>Clinical documentation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="subjective" className="text-base font-semibold">Subjective</Label>
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
                <Label htmlFor="objective" className="text-base font-semibold">Objective</Label>
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
                <Label htmlFor="assessment" className="text-base font-semibold">Assessment</Label>
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
                <Label htmlFor="plan" className="text-base font-semibold">Plan</Label>
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

          {note.transcript && (
            <Card data-testid="card-transcript">
              <CardHeader>
                <CardTitle>Original Transcript</CardTitle>
                <CardDescription>Raw transcription from the consultation</CardDescription>
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
    </div>
  );
}
