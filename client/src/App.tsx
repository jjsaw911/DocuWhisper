import { Switch, Route, useRoute, useParams } from "wouter";
import { lazy, Suspense } from "react";
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

const NotFound = lazy(() => import("@/pages/not-found"));
const Landing = lazy(() => import("@/pages/landing"));
const Session = lazy(() => import("@/pages/session"));
const NoteDetailPage = lazy(() => import("@/pages/note-detail"));
const Subscription = lazy(() => import("@/pages/subscription"));
const Templates = lazy(() => import("@/pages/templates"));
const Tasks = lazy(() => import("@/pages/tasks"));
const Admin = lazy(() => import("@/pages/admin"));
const Invite = lazy(() => import("@/pages/invite"));
const Settings = lazy(() => import("@/pages/settings"));
const Mailbox = lazy(() => import("@/pages/mailbox"));
const SharedNotes = lazy(() => import("@/pages/shared-notes"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Notes = lazy(() => import("@/pages/notes"));
const Guide = lazy(() => import("@/pages/guide"));
const WhatsNew = lazy(() => import("@/pages/whats-new"));
const EMRPatients = lazy(() => import("@/pages/emr/patients"));
const EMRPatientDetail = lazy(() => import("@/pages/emr/patient-detail"));
const EMRSchedule = lazy(() => import("@/pages/emr/schedule"));
const EMRTeam = lazy(() => import("@/pages/emr/team"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy"));
const TermsOfService = lazy(() => import("@/pages/terms"));
const AccountDeletion = lazy(() => import("@/pages/account-deletion"));
const Support = lazy(() => import("@/pages/support"));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

// Wrapper to force remount when note ID changes - fixes navigation showing wrong note
function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  return <NoteDetailPage key={id} />;
}

function AuthenticatedLayout() {
  useSessionTimeout(); // Auto-logout after inactivity unless disabled in Session Security settings
  
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
              <Route path="/mailbox" component={Mailbox} />
              <Route path="/shared-notes" component={SharedNotes} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/guide" component={Guide} />
              <Route path="/whats-new" component={WhatsNew} />
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
  const [isPrivacyPage] = useRoute("/privacy");
  const [isTermsPage] = useRoute("/terms");
  const [isAccountDeletionPage] = useRoute("/account-deletion");
  const [isSupportPage] = useRoute("/support");

  if (isLoading) {
    return <RouteFallback />;
  }

  // Public pages are accessible regardless of auth state.
  if (isInvitePage || isPrivacyPage || isTermsPage || isAccountDeletionPage || isSupportPage) {
    return (
      <Switch>
        <Route path="/invite/:code" component={Invite} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/account-deletion" component={AccountDeletion} />
        <Route path="/support" component={Support} />
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
            <Suspense fallback={<RouteFallback />}>
              <Router />
            </Suspense>
          </TooltipProvider>
        </RecordingProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
