import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useState } from "react";
import { 
  ArrowLeft, 
  Stethoscope, 
  FileText, 
  Plus, 
  Search,
  Trash2,
  Calendar,
  User
} from "lucide-react";
import type { Note } from "@shared/schema";

export default function Notes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: notes, isLoading } = useQuery<Note[]>({
    queryKey: ["/api/notes"],
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      await apiRequest("DELETE", `/api/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      toast({
        title: "Note deleted",
        description: "The note has been permanently deleted",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete note",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const filteredNotes = notes?.filter((note) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      note.title.toLowerCase().includes(searchLower) ||
      note.patientName?.toLowerCase().includes(searchLower) ||
      note.specialty?.toLowerCase().includes(searchLower)
    );
  });

  const getSpecialtyColor = (specialty?: string | null) => {
    const colors: Record<string, string> = {
      general: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      cardiology: "bg-red-500/10 text-red-600 dark:text-red-400",
      pediatrics: "bg-green-500/10 text-green-600 dark:text-green-400",
      psychiatry: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
      orthopedics: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
      dermatology: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
      neurology: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
      internal: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    };
    return colors[specialty || "general"] || colors.general;
  };

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
                <span className="text-xl font-semibold tracking-tight">Notes</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button asChild data-testid="button-new-note">
                <Link href="/record">
                  <Plus className="mr-2 h-4 w-4" />
                  New Recording
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search notes..."
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredNotes && filteredNotes.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredNotes.map((note) => (
              <Card key={note.id} className="group hover-elevate" data-testid={`card-note-${note.id}`}>
                <Link href={`/notes/${note.id}`} className="block">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base line-clamp-1">{note.title}</CardTitle>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity -mr-2"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            data-testid={`button-delete-${note.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete note?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete the note
                              "{note.title}".
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(note.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    {note.specialty && (
                      <Badge variant="secondary" className={`w-fit ${getSpecialtyColor(note.specialty)}`}>
                        {note.specialty}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      {note.patientName && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          <span className="truncate">{note.patientName}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {note.assessment && (
                      <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                        {note.assessment}
                      </p>
                    )}
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="max-w-md mx-auto" data-testid="card-empty-state">
            <CardContent className="pt-12 pb-12 text-center">
              <FileText className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {search ? "No notes found" : "No notes yet"}
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                {search
                  ? "Try a different search term"
                  : "Start recording your first consultation to create a note"}
              </p>
              {!search && (
                <Button asChild>
                  <Link href="/record">
                    <Plus className="mr-2 h-4 w-4" />
                    New Recording
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
