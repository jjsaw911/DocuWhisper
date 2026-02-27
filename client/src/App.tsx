import { Switch, Route, useRoute, useParams } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { RecordingProvider } from "@/contexts/recording-context";
import { useAuth } from "@/hooks/use-auth";
import { useSessionTimeout } from "@/hooks/use-session-timeout";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Session from "@/pages/session";
import NoteDetailPage from "@/pages/note-detail";
import Subscription from "@/pages/subscription";
import Templates from "@/pages/templates";
import Tasks from "@/pages/tasks";
import Admin from "@/pages/admin";
import Invite from "@/pages/invite";
import Settings from "@/pages/settings";
import SharedNotes from "@/pages/shared-notes";
import Analytics from "@/pages/analytics";
import Notes from "@/pages/notes";
import Guide from "@/pages/guide";
import EMRPatients from "@/pages/emr/patients";
import EMRPatientDetail from "@/pages/emr/patient-detail";
import EMRSchedule from "@/pages/emr/schedule";
import EMRTeam from "@/pages/emr/team";

// Wrapper to force remount when note ID changes - fixes navigation showing wrong note
function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  return <NoteDetailPage key={id} />;
}

function AuthenticatedLayout() {
  useSessionTimeout(); // HIPAA compliance - auto-logout after 30 min inactivity
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <div className="md:hidden border-b px-2 py-1">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
          </div>
          <main className="flex-1 overflow-hidden">
            <Switch>
              <Route path="/" component={Session} />
              <Route path="/session" component={Session} />
              <Route path="/session/new" component={Session} />
              <Route path="/session/:id" component={Session} />
              <Route path="/notes" component={Notes} />
              <Route path="/notes/:id" component={NoteDetail} />
              <Route path="/tasks" component={Tasks} />
              <Route path="/subscription" component={Subscription} />
              <Route path="/templates" component={Templates} />
              <Route path="/settings" component={Settings} />
              <Route path="/shared-notes" component={SharedNotes} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/guide" component={Guide} />
              <Route path="/emr/patients" component={EMRPatients} />
              <Route path="/emr/patients/:id" component={EMRPatientDetail} />
              <Route path="/emr/schedule" component={EMRSchedule} />
              <Route path="/emr/team" component={EMRTeam} />
              <Route path="/admin" component={Admin} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  const [isInvitePage] = useRoute("/invite/:code");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Invite page is accessible to everyone (handles its own auth state)
  if (isInvitePage) {
    return (
      <Switch>
        <Route path="/invite/:code" component={Invite} />
      </Switch>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="docuwhisper-theme">
        <RecordingProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </RecordingProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
