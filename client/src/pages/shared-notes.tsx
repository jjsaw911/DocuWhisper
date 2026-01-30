import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { FileText, User, Clock, Users, Share2, Eye } from "lucide-react";
import type { Note } from "@shared/schema";

interface SharedNoteItem {
  note: Note;
  sharedBy: string;
  permission: string;
}

export default function SharedNotes() {
  const { user } = useAuth();

  const { data: sharedNotes = [], isLoading } = useQuery<SharedNoteItem[]>({
    queryKey: ["/api/shared-notes"],
    enabled: !!user,
  });

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="flex flex-col h-full">
      <header className="border-b bg-background/95 backdrop-blur px-6 py-4">
        <div className="flex items-center gap-3">
          <Share2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Shared Notes</h1>
            <p className="text-muted-foreground">Notes shared with you by your team</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : sharedNotes.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No shared notes yet</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    When team members share notes with you or your practice, they'll appear here.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sharedNotes.map(({ note, sharedBy, permission }) => (
                <Link key={note.id} href={`/notes/${note.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`shared-note-${note.id}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold truncate">{note.title}</h3>
                            <Badge variant="outline" className="flex-shrink-0">
                              <Eye className="h-3 w-3 mr-1" />
                              {permission}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            {note.patientName && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {note.patientName}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(note.createdAt)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Share2 className="h-3 w-3" />
                              Shared by: {sharedBy}
                            </span>
                          </div>
                          {note.assessment && (
                            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                              {note.assessment.substring(0, 150)}...
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
