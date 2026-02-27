import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Mic,
  FileText,
  ClipboardCopy,
  CheckSquare,
  ArrowRight,
} from "lucide-react";

const quickSteps = [
  {
    title: "1) Start a session",
    description: "Go to Scribe and start a new session. You can transcribe live, dictate, or upload audio.",
    icon: Mic,
  },
  {
    title: "2) Review SOAP note",
    description: "Open the note, review the generated SOAP sections, and make edits before saving.",
    icon: FileText,
  },
  {
    title: "3) Link to EMR",
    description: "Use Link to EMR on the note page when applicable to connect the chart to an EMR patient.",
    icon: ClipboardCopy,
  },
  {
    title: "4) Mark as copied",
    description: "Check Copied to EMR once you have pasted/charted in your external EMR.",
    icon: CheckSquare,
  },
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
              Quick instructions for Scribe, SOAP note workflow, and EMR copy tracking.
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
            <Button variant="outline" asChild data-testid="button-guide-go-settings">
              <Link href="/settings">Open Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
