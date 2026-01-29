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
  SidebarSeparator,
} from "@/components/ui/sidebar";
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
  Stethoscope,
  Crown,
} from "lucide-react";
import type { Note } from "@shared/schema";
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

  const isOwner = adminCheck?.isAdmin === true;

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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/" || location.startsWith("/session")}
                >
                  <Link href="/" data-testid="nav-scribe">
                    <FileText className="h-4 w-4" />
                    <span>Scribe</span>
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
                <SidebarMenuButton asChild isActive={location === "/subscription"}>
                  <Link href="/subscription" data-testid="nav-subscription">
                    <CreditCard className="h-4 w-4" />
                    <span>Subscription</span>
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

        <SidebarSeparator />

        <SidebarGroup className="flex-1">
          <SidebarGroupLabel>Recent Sessions</SidebarGroupLabel>
          <SidebarGroupContent className="flex-1">
            <ScrollArea className="h-[calc(100vh-400px)]">
              <SidebarMenu>
                {Object.entries(groupedNotes).map(([date, dateNotes]) => (
                  <div key={date}>
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      {date}
                    </div>
                    {dateNotes.map((note) => (
                      <SidebarMenuItem key={note.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === `/notes/${note.id}`}
                          className="flex flex-col items-start gap-0 h-auto py-2"
                        >
                          <Link href={`/notes/${note.id}`} data-testid={`session-${note.id}`}>
                            <span className="font-medium truncate w-full">
                              {note.patientName || note.title || "Untitled Session"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(note.createdAt).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </div>
                ))}
                {notes.length === 0 && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    No sessions yet
                  </div>
                )}
              </SidebarMenu>
            </ScrollArea>
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
              {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium truncate">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
