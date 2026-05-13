import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useRecording } from "@/contexts/recording-context";
import { useCopiedToEmr } from "@/hooks/use-copied-to-emr";
import { useScribeGenerationStatus } from "@/hooks/use-scribe-generation-status";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  FileText,
  BookOpen,
  LayoutTemplate,
  Settings,
  CreditCard,
  HelpCircle,
  LogOut,
  Crown,
  ListTodo,
  Share2,
  Mail,
  MessageSquare,
  TrendingUp,
  ChevronRight,
  Users,
  CalendarDays,
  ClipboardList,
  Trash2,
  AlertTriangle,
  Mic,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Note, UserSettings } from "@shared/schema";
import logoImage from "@/assets/logo.png";

interface AdminCheckData {
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

interface MailboxUnreadCount {
  unreadCount: number;
}

interface InternalInboxUnreadCount {
  unreadCount: number;
}

interface SupportEmailUnreadCount {
  unreadCount: number;
}

function playNotificationChime() {
  if (typeof window === "undefined") return;

  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) return;

  try {
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.12);

    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.05, context.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.onended = () => {
      void context.close();
    };
  } catch {
    // Best effort only.
  }
}

export function AppSidebar() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const [scribeMenuOpen, setScribeMenuOpen] = useState(false);
  const [emrMenuOpen, setEmrMenuOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem("docuwhisper:sidebar:emr-open") === "true";
  });
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isRecording, audioLevel } = useRecording();
  const { pendingCount, currentLabel, isGenerating } = useScribeGenerationStatus(user?.id);
  const previousMailboxUnreadRef = useRef<number | null>(null);
  const previousInternalInboxUnreadRef = useRef<number | null>(null);
  const previousSupportEmailUnreadRef = useRef<number | null>(null);

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["/api/notes"],
  });
  const { data: mailboxUnread } = useQuery<MailboxUnreadCount>({
    queryKey: ["/api/mailbox/unread-count"],
    enabled: !!user,
    refetchInterval: 30000,
  });
  const { data: adminCheck } = useQuery<AdminCheckData>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });
  const { data: internalInboxUnread } = useQuery<InternalInboxUnreadCount>({
    queryKey: ["/api/admin/internal-messages/unread-count"],
    enabled: !!user && adminCheck?.isAdmin === true,
    refetchInterval: 30000,
  });
  const { data: supportEmailUnread } = useQuery<SupportEmailUnreadCount>({
    queryKey: ["/api/admin/support-email/unread-count"],
    enabled: !!user && adminCheck?.isAdmin === true,
    refetchInterval: 30000,
  });
  const { isNoteCopiedToEmr, setNoteCopiedToEmr, pruneCopiedToEmrForNotes } = useCopiedToEmr(user?.id);

  useEffect(() => {
    if (notes.length === 0) return;
    pruneCopiedToEmrForNotes(notes.map((note) => note.id));
  }, [notes, pruneCopiedToEmrForNotes]);

  useEffect(() => {
    const unreadCount = mailboxUnread?.unreadCount;
    if (typeof unreadCount !== "number") return;

    if (previousMailboxUnreadRef.current !== null && unreadCount > previousMailboxUnreadRef.current) {
      playNotificationChime();
      toast({
        title: unreadCount === 1 ? "New mailbox message" : "New mailbox messages",
        description:
          unreadCount === 1
            ? "You have 1 unread message in your mailbox."
            : `You have ${unreadCount} unread messages in your mailbox.`,
      });
    }

    previousMailboxUnreadRef.current = unreadCount;
  }, [mailboxUnread?.unreadCount, toast]);

  useEffect(() => {
    const unreadCount = internalInboxUnread?.unreadCount;
    if (typeof unreadCount !== "number") return;

    if (
      previousInternalInboxUnreadRef.current !== null &&
      unreadCount > previousInternalInboxUnreadRef.current
    ) {
      playNotificationChime();
      toast({
        title: unreadCount === 1 ? "New internal inbox message" : "New internal inbox messages",
        description:
          unreadCount === 1
            ? "There is 1 unread message in the admin inbox."
            : `There are ${unreadCount} unread messages in the admin inbox.`,
      });
    }

    previousInternalInboxUnreadRef.current = unreadCount;
  }, [internalInboxUnread?.unreadCount, toast]);

  useEffect(() => {
    const unreadCount = supportEmailUnread?.unreadCount;
    if (typeof unreadCount !== "number") return;

    if (
      previousSupportEmailUnreadRef.current !== null &&
      unreadCount > previousSupportEmailUnreadRef.current
    ) {
      playNotificationChime();
      toast({
        title: unreadCount === 1 ? "New support email" : "New support emails",
        description:
          unreadCount === 1
            ? "There is 1 unread message in Support Email."
            : `There are ${unreadCount} unread messages in Support Email.`,
      });
    }

    previousSupportEmailUnreadRef.current = unreadCount;
  }, [supportEmailUnread?.unreadCount, toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("docuwhisper:sidebar:emr-open", emrMenuOpen ? "true" : "false");
  }, [emrMenuOpen]);

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      await apiRequest("DELETE", `/api/notes/${noteId}`);
      return noteId;
    },
    onSuccess: (deletedNoteId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setNoteToDelete(null);
      
      // If we're currently viewing the deleted note, navigate to another note or session
      if (location === `/notes/${deletedNoteId}`) {
        const remainingNotes = notes.filter(n => n.id !== deletedNoteId);
        if (remainingNotes.length > 0) {
          navigate(`/notes/${remainingNotes[0].id}`);
        } else {
          navigate("/session");
        }
      }
      
      toast({
        title: "Note deleted",
        description: "The note has been permanently removed and will no longer appear in analytics",
      });
    },
    onError: () => {
      setNoteToDelete(null);
      toast({
        title: "Error",
        description: "Failed to delete note",
        variant: "destructive",
      });
    },
  });
  
  const handleDeleteClick = (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    e.preventDefault();
    setScribeMenuOpen(false);
    // Small delay to ensure dropdown closes before dialog opens
    setTimeout(() => {
      setNoteToDelete(note);
    }, 100);
  };
  
  const confirmDelete = () => {
    if (noteToDelete) {
      deleteNoteMutation.mutate(noteToDelete.id);
    }
  };

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    enabled: !!user,
  });

  const { data: emrAccess } = useQuery<{ hasAccess: boolean }>({
    queryKey: ["/api/emr/access"],
    enabled: !!user,
  });

  const hasAdminAccess = adminCheck?.isAdmin === true;
  const hasEmrAccess = emrAccess?.hasAccess === true;
  
  const displayName = settings?.preferredName || settings?.firstName || user?.firstName || user?.email?.split("@")[0] || "User";

  const groupNotesByDate = (notes: Note[]) => {
    const groups: { [key: string]: Note[] } = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    notes.forEach((note) => {
      const noteDate = new Date(note.createdAt);
      noteDate.setHours(0, 0, 0, 0);

      let key: string;
      if (noteDate.getTime() === today.getTime()) {
        key = "Today";
      } else if (noteDate.getTime() === yesterday.getTime()) {
        key = "Yesterday";
      } else {
        key = noteDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: noteDate.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
        });
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(note);
    });

    return groups;
  };

  // Show all notes instead of just recent ones
  const allNotes = notes;

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <Link href="/" data-testid="nav-home-logo" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <img src={logoImage} alt="DocuWhisper" className="h-8 w-8 rounded-lg" />
            <span className="font-semibold text-lg">DocuWhisper</span>
          </Link>
          {/* Recording Indicator */}
          {isRecording && (() => {
            const maxLevel = audioLevel.length > 0 ? Math.max(...audioLevel) : 0;
            return (
              <div className="flex items-center gap-1" data-testid="recording-indicator">
                <div 
                  className="relative flex items-center justify-center w-8 h-8"
                  style={{
                    transform: `scale(${1 + maxLevel * 0.3})`,
                    transition: 'transform 0.1s ease-out',
                  }}
                >
                  <Mic 
                    className="h-4 w-4 transition-colors duration-100"
                    style={{
                      color: maxLevel > 0.1 
                        ? 'hsl(var(--destructive))' 
                        : 'hsl(var(--primary))',
                    }}
                  />
                  {/* Pulsing ring */}
                  <span 
                    className="absolute inset-0 rounded-full animate-ping opacity-40"
                    style={{
                      backgroundColor: maxLevel > 0.1 
                        ? 'hsl(var(--destructive))' 
                        : 'hsl(var(--primary))',
                    }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <div className="px-3 py-2">
          <Button
            className="w-full justify-start gap-2"
            onClick={() => navigate("/session/new")}
            data-testid="button-new-session"
          >
            <Plus className="h-4 w-4" />
            New session
          </Button>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Scribe with flyout submenu */}
              <SidebarMenuItem>
                <DropdownMenu open={scribeMenuOpen} onOpenChange={setScribeMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      data-testid="nav-scribe"
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 ${
                        location === "/" || location.startsWith("/session") || location.startsWith("/notes")
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                      <div className="flex min-w-0 flex-col items-start leading-tight">
                        <span>Scribe</span>
                        {isGenerating && (
                          <span
                            className="max-w-[150px] truncate text-[10px] font-normal text-muted-foreground"
                            data-testid="label-scribe-generating"
                          >
                            {pendingCount > 1
                              ? `${pendingCount} notes in progress...`
                              : `In progress: ${currentLabel}`}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent 
                    side="right" 
                    align="start" 
                    sideOffset={8}
                    className="w-80 max-w-[calc(100vw-2rem)]"
                  >
                    <DropdownMenuLabel className="flex items-center justify-between">
                      <span>Recent Sessions</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setScribeMenuOpen(false);
                          navigate("/notes");
                        }}
                        data-testid="button-view-all-notes"
                      >
                        View all
                      </Button>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {allNotes.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No sessions yet. Start a new session to begin.
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px]">
                        {Object.entries(groupNotesByDate(allNotes)).map(([date, dateNotes]) => (
                          <div key={date}>
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                              {date}
                            </div>
                            {dateNotes.map((note) => {
                              const isCurrentNote = location === `/notes/${note.id}`;
                              const isCopiedToEmr = isNoteCopiedToEmr(note.id);
                              return (
                                <div
                                  key={note.id}
                                  className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 px-1.5 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent ${isCurrentNote ? 'bg-accent' : ''}`}
                                  data-testid={`note-item-${note.id}`}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteClick(e, note);
                                    }}
                                    className="flex items-center justify-center shrink-0 w-6 h-6 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                    data-testid={`button-delete-note-${note.id}`}
                                    title="Delete note"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                                  </button>
                                  <div 
                                    className="flex items-center gap-2 min-w-0 cursor-pointer"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      const targetPath = `/notes/${note.id}`;
                                      setScribeMenuOpen(false);
                                      setTimeout(() => {
                                        navigate(targetPath);
                                      }, 10);
                                    }}
                                  >
                                    {isCurrentNote && (
                                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                    )}
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                      <span className={`truncate text-sm ${isCurrentNote ? 'font-semibold' : 'font-medium'}`}>
                                        {note.title || note.patientName || "Untitled"}
                                      </span>
                                      {note.patientName && note.title !== note.patientName && (
                                        <span className="truncate text-xs text-muted-foreground">
                                          {note.patientName}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <Checkbox
                                    checked={isCopiedToEmr}
                                    className="justify-self-end"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                    }}
                                    onCheckedChange={(checked) => {
                                      setNoteCopiedToEmr(note.id, checked === true);
                                    }}
                                    aria-label={`Mark ${note.title || note.patientName || "note"} as copied to EMR`}
                                    title="Copied to external EMR"
                                    data-testid={`checkbox-note-copied-to-emr-${note.id}`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </ScrollArea>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => {
                        setScribeMenuOpen(false);
                        navigate("/session/new");
                      }}
                      data-testid="dropdown-new-session"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New session
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/tasks"}>
                  <Link href="/tasks" data-testid="nav-tasks">
                    <ListTodo className="h-4 w-4" />
                    <span>Tasks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/templates"}>
                  <Link href="/templates" data-testid="nav-templates">
                    <LayoutTemplate className="h-4 w-4" />
                    <span>Templates</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/shared-notes"}>
                  <Link href="/shared-notes" data-testid="nav-shared-notes">
                    <Share2 className="h-4 w-4" />
                    <span>Shared Notes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/mailbox"}>
                  <Link href="/mailbox" data-testid="nav-mailbox">
                    <MessageSquare className="h-4 w-4" />
                    <span>Mailbox</span>
                    {(mailboxUnread?.unreadCount || 0) > 0 && (
                      <span
                        className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"
                        data-testid="badge-sidebar-mailbox-unread"
                      >
                        {mailboxUnread?.unreadCount}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/analytics"}>
                  <Link href="/analytics" data-testid="nav-analytics">
                    <TrendingUp className="h-4 w-4" />
                    <span>Analytics</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/guide"}>
                  <Link href="/guide" data-testid="nav-guide">
                    <BookOpen className="h-4 w-4" />
                    <span>Guide</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {hasEmrAccess && (
                <Collapsible
                  open={emrMenuOpen}
                  onOpenChange={setEmrMenuOpen}
                  className="group/emr"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        isActive={location.startsWith("/emr")}
                        data-testid="nav-emr"
                      >
                        <ClipboardList className="h-4 w-4" />
                        <span>EMR</span>
                        <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/emr:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location === "/emr/patients" || location.startsWith("/emr/patients/")}
                          >
                            <Link href="/emr/patients" data-testid="nav-emr-patients">
                              <Users className="h-4 w-4" />
                              <span>Patients</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location === "/emr/schedule"}
                          >
                            <Link href="/emr/schedule" data-testid="nav-emr-schedule">
                              <CalendarDays className="h-4 w-4" />
                              <span>Schedule</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={location === "/emr/team"}
                          >
                            <Link href="/emr/team" data-testid="nav-emr-team">
                              <Users className="h-4 w-4" />
                              <span>Team Access</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/subscription"}>
                  <Link href="/subscription" data-testid="nav-subscription">
                    <CreditCard className="h-4 w-4" />
                    <span>Subscription</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/settings"}>
                  <Link href="/settings" data-testid="nav-settings">
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {hasAdminAccess && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/support-email"}>
                    <Link href="/support-email" data-testid="nav-support-email">
                      <Mail className="h-4 w-4" />
                      <span>Support Email</span>
                      {(supportEmailUnread?.unreadCount || 0) > 0 && (
                        <span
                          className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"
                          data-testid="badge-sidebar-support-email-unread"
                        >
                          {supportEmailUnread?.unreadCount}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {hasAdminAccess && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/admin"}>
                    <Link href="/admin" data-testid="nav-admin">
                      <Crown className="h-4 w-4" />
                      <span>Admin</span>
                      {((internalInboxUnread?.unreadCount || 0) + (supportEmailUnread?.unreadCount || 0)) > 0 && (
                        <span
                          className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"
                          data-testid="badge-sidebar-admin-unread"
                        >
                          {(internalInboxUnread?.unreadCount || 0) + (supportEmailUnread?.unreadCount || 0)}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

              </SidebarContent>

      <SidebarFooter className="border-t p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/support" data-testid="nav-help">
                <HelpCircle className="h-4 w-4" />
                <span>Help</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="/api/logout" data-testid="nav-logout">
                <LogOut className="h-4 w-4" />
                <span>Log out</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarSeparator className="my-2" />
        <div className="px-2 pb-1">
          <Link
            href="/whats-new"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            data-testid="nav-whats-new"
          >
            What&apos;s New
          </Link>
        </div>
        <div className="px-2 pb-1 text-[10px] text-muted-foreground" data-testid="text-app-version">
          {APP_VERSION_LABEL}
        </div>
        <div className="flex items-center gap-2 px-2 py-1">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {displayName[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate flex-1 min-w-0" data-testid="text-user-display-name">
            {displayName}
          </span>
        </div>
      </SidebarFooter>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!noteToDelete} onOpenChange={(open) => !open && setNoteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete Note
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete "{noteToDelete?.title || noteToDelete?.patientName || 'this note'}"?
              </p>
              <p className="text-destructive font-medium">
                This action cannot be undone. The note will be permanently removed and will no longer be included in your analytics data.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}
