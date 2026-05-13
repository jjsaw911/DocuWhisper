import { Link } from "wouter";
import { AppleMark } from "@/components/apple-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Mic,
  FileText,
  ClipboardList,
  Code2,
  FileSignature,
  ListTodo,
  ClipboardCopy,
  CheckSquare,
  ArrowRight,
  MessageSquare,
  CreditCard,
  Shield,
  PauseCircle,
  RotateCcw,
  AlertTriangle,
  Smartphone,
} from "lucide-react";

const quickSteps = [
  {
    title: "1) Sign in and activate access",
    description: "Use your own login. New verified accounts start with a 14-day trial and can subscribe later if access is not granted manually.",
    icon: CreditCard,
  },
  {
    title: "2) Start a session",
    description: "Go to Scribe and start a new session. You can transcribe live, dictate, or upload audio.",
    icon: Mic,
  },
  {
    title: "3) Review the note",
    description: "Open the generated note, review SOAP content, and use the AI tools panel for summaries, billing codes, referrals, and tasks.",
    icon: FileText,
  },
  {
    title: "4) Route the chart",
    description: "Share it, send it through Mailbox, or link it to an EMR patient if your account includes EMR access.",
    icon: MessageSquare,
  },
  {
    title: "5) Track completion",
    description: "Mark Copied to EMR after charting externally, or manage trial, billing, and invite-code access from Subscription.",
    icon: CheckSquare,
  },
  {
    title: "6) Use the companion app",
    description: "DocuWhisper Mobile for iPhone and iPad lets you capture, review, and resume notes on the go.",
    icon: Smartphone,
  },
];

const featureGuides = [
  {
    title: "Scribe",
    description: "Capture audio, generate a clinical note, resume visits safely, and review sessions from the sidebar flyout or Notes list.",
    where: "Navigation -> Scribe, New session, Notes",
    steps: "Start a new session, dictate or upload audio, click Stop to finish and auto-generate SOAP, or use Finish Later if you only want to save the transcript and come back later.",
    output: "SOAP note, transcript, draft recovery, stale-note warnings after resumed visits, and note history grouped by date.",
    icon: Mic,
  },
  {
    title: "AI Clinical Tools",
    description: "Generate summaries, ICD-10 suggestions, CPT procedures, referral letters, and follow-up tasks from the note page.",
    where: "SOAP note page -> AI Tools panel",
    steps: "Open a note, choose the tool you need, then review the generated output before copying or saving.",
    output: "Patient instructions, billing suggestions, referral content, and actionable follow-up items.",
    icon: Code2,
  },
  {
    title: "Mailbox",
    description: "Send internal messages, confirm the recipient before sending, and track inbox and sent status.",
    where: "Navigation -> Mailbox",
    steps: "Search for a user, confirm the recipient, send the message, then click inbox items to mark them read.",
    output: "Unread badge in the sidebar, read/unread labels, sent read status, and bulk delete for inbox or sent mail.",
    icon: MessageSquare,
  },
  {
    title: "EMR Workflow",
    description: "Accounts with EMR access can link notes to patients, review schedules, and manage team access.",
    where: "Navigation -> EMR, note action bar -> Link to EMR / Copied to EMR",
    steps: "Link the chart to the correct patient, copy the note into your external EMR, then mark it copied.",
    output: "Patient-linked notes, shared copied state, and EMR patient/schedule/team pages.",
    icon: ClipboardCopy,
  },
  {
    title: "Billing & Trial",
    description: "Every regular user can see their current access state, redeem an invite code, or subscribe through Stripe.",
    where: "Navigation -> Subscription",
    steps: "Review the trial end date or access status, subscribe if needed, or redeem an invite code you were given.",
    output: "Active access, trial tracking, billing portal access, or manually granted non-billing access.",
    icon: CreditCard,
  },
  {
    title: "Owner & Admin Controls",
    description: "Owner accounts keep permanent access and can manage internal inbox, invite codes, and membership extensions.",
    where: "Navigation -> Admin",
    steps: "Open Admin to manage access windows, review internal messages, and handle practice-level controls.",
    output: "Admin inbox, access grants, invite codes, and owner-only account management.",
    icon: Shield,
  },
];

const sessionControls = [
  {
    title: "Stop",
    description: "Ends the recording, waits for remaining chunks, generates SOAP, and saves the note.",
    icon: Mic,
  },
  {
    title: "Finish Later",
    description: "Ends the recording and saves transcript progress without generating SOAP so you can resume after testing or a follow-up discussion.",
    icon: PauseCircle,
  },
  {
    title: "Resume",
    description: "Open an existing note and add more transcript later. The note is marked stale until you regenerate and save the SOAP.",
    icon: RotateCcw,
  },
];

const recoveryItems = [
  "If SOAP generation fails, the transcript is preserved and a draft can still be recovered from Session.",
  "New-session failures now fall back to a transcript-only draft note in Scribe instead of disappearing.",
  "Resumed visits keep the same note and show a stale-warning until SOAP is regenerated and saved again.",
];

export default function Guide() {
  return (
    <div className="h-full overflow-auto bg-background p-6" data-testid="page-guide">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-semibold">Guide</h1>
              <Badge variant="secondary">Getting Started</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Quick instructions for account access, scribe workflow, mailbox, billing, and EMR usage as the app works today.
            </p>
          </div>
          <Button asChild data-testid="button-guide-start-session">
            <Link href="/session/new">
              Start New Session
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {quickSteps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-primary" />
                    {step.title}
                  </CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4 text-primary" />
              DocuWhisper Mobile
            </CardTitle>
            <CardDescription>
              The mobile app is a companion to your DocuWhisper account. Sign in with your existing account and keep working away from your desk.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>1. Use the app to record, review notes, and resume existing charts.</p>
            <p>2. Subscriptions are still managed on the website. The app is a companion workflow, not a separate purchase flow.</p>
            <Button asChild variant="outline" data-testid="button-guide-app-store">
              <a
                href="https://apps.apple.com/us/app/docuwhispermobile/id6759997507"
                target="_blank"
                rel="noreferrer"
              >
                <AppleMark className="mr-2 h-4 w-4" />
                Open App Store Listing
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session Controls</CardTitle>
            <CardDescription>
              Use the correct finish action depending on whether the visit is actually done.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {sessionControls.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 text-primary" />
                      {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground">
                    {item.description}
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Where to find Copied to EMR</CardTitle>
            <CardDescription>
              The copied status is shared between both views so you can track completion from either location.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Scribe popup: open Navigation - Scribe and use the checkbox on each note row.</p>
            <p>2. SOAP note page: use the Copied to EMR checkbox in the top action bar.</p>
            <p>3. Checking or unchecking in one place updates the other place automatically.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mailbox and Notifications</CardTitle>
            <CardDescription>
              Mailbox is now part of the daily workflow, including unread indicators and read tracking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. The sidebar shows an unread badge next to Mailbox when messages need attention.</p>
            <p>2. Opening an unread inbox message marks it read automatically.</p>
            <p>3. Sent mail shows whether the recipient has read it.</p>
            <p>4. The app can show a toast and short chime when new unread mail arrives.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-primary" />
              Recovery and Resume Notes
            </CardTitle>
            <CardDescription>
              What happens if you stop mid-visit, return after testing, or hit a generation error.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {recoveryItems.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clinical Output Guide</CardTitle>
            <CardDescription>
              Details for the main user-facing workflows that are live in the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {featureGuides.map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="border-dashed">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Icon className="h-4 w-4 text-primary" />
                      {item.title}
                    </CardTitle>
                    <CardDescription>{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs text-muted-foreground">
                    <p><span className="font-medium text-foreground">Where:</span> {item.where}</p>
                    <p><span className="font-medium text-foreground">How:</span> {item.steps}</p>
                    <p><span className="font-medium text-foreground">Output:</span> {item.output}</p>
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" asChild data-testid="button-guide-go-scribe">
              <Link href="/session">Open Scribe</Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-guide-go-notes">
              <Link href="/notes">View All Notes</Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-guide-go-tasks">
              <Link href="/tasks">Open Tasks</Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-guide-go-mailbox">
              <Link href="/mailbox">Open Mailbox</Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-guide-go-subscription">
              <Link href="/subscription">View Subscription</Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-guide-go-settings">
              <Link href="/settings">Open Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
