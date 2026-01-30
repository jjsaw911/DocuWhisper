import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  FileText,
  LayoutTemplate,
  Settings,
  CreditCard,
  HelpCircle,
  LogOut,
  Crown,
  ListTodo,
  Share2,
  TrendingUp,
  ChevronRight,
  Users,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import type { Note, UserSettings } from "@shared/schema";
import logoImage from "@/assets/logo.png";

interface AdminCheckData {
  isAdmin: boolean;
}

export function AppSidebar() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();

  const { data: notes = [] } = useQuery<Note[]>({
    queryKey: ["/api/notes"],
  });

  const { data: adminCheck } = useQuery<AdminCheckData>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    enabled: !!user,
  });

  const { data: emrAccess } = useQuery<{ hasAccess: boolean }>({
    queryKey: ["/api/emr/access"],
    enabled: !!user,
  });

  const isOwner = adminCheck?.isAdmin === true;
  const hasEmrAccess = emrAccess?.hasAccess === true;
  
  // Get display name: preferredName > firstName from settings > firstName from auth > email
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

  const groupedNotes = groupNotesByDate(notes);

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src={logoImage} alt="DocuWhisper" className="h-8 w-8 rounded-lg" />
          <span className="font-semibold text-lg">DocuWhisper</span>
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
              {/* Scribe with collapsible recent sessions */}
              <Collapsible defaultOpen className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      isActive={location === "/" || location.startsWith("/session") || location.startsWith("/notes")}
                      data-testid="nav-scribe"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Scribe</span>
                      <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {Object.entries(groupedNotes).map(([date, dateNotes]) => (
                        <div key={date}>
                          <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                            {date}
                          </div>
                          {dateNotes.map((note) => (
                            <SidebarMenuSubItem key={note.id}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={location === `/notes/${note.id}`}
                              >
                                <Link href={`/notes/${note.id}`} data-testid={`session-${note.id}`}>
                                  <span className="truncate">
                                    {note.patientName || note.title || "Untitled"}
                                  </span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </div>
                      ))}
                      {notes.length === 0 && (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                          No sessions yet
                        </div>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
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
                <SidebarMenuButton asChild isActive={location === "/analytics"}>
                  <Link href="/analytics" data-testid="nav-analytics">
                    <TrendingUp className="h-4 w-4" />
                    <span>Analytics</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {hasEmrAccess && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/emr/patients" || location.startsWith("/emr/patients/")}>
                      <Link href="/emr/patients" data-testid="nav-emr-patients">
                        <Users className="h-4 w-4" />
                        <span>Patients</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/emr/schedule"}>
                      <Link href="/emr/schedule" data-testid="nav-emr-schedule">
                        <CalendarDays className="h-4 w-4" />
                        <span>Schedule</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
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
              {isOwner && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location === "/admin"}>
                    <Link href="/admin" data-testid="nav-admin">
                      <Crown className="h-4 w-4" />
                      <span>Admin</span>
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
              <a href="mailto:support@docuwhisper.com" data-testid="nav-help">
                <HelpCircle className="h-4 w-4" />
                <span>Help</span>
              </a>
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
        <div className="flex items-center gap-2 px-2 py-1">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {displayName[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium truncate flex-1 min-w-0" data-testid="text-user-display-name">
            {displayName}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
