import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, CreditCard, LifeBuoy, Mail, Mic, RotateCcw, Shield } from "lucide-react";

const faqItems = [
  {
    question: "What is the difference between Stop and Finish Later?",
    answer:
      "Stop ends the recording and immediately finishes the visit by generating SOAP and saving the note. Finish Later ends the recording but only saves transcript progress so you can come back after testing or a later discussion.",
  },
  {
    question: "What happens when I resume an older note?",
    answer:
      "The resumed note keeps the same record. New transcript can be added without automatically replacing the existing SOAP until you explicitly regenerate and save it. The note will show a stale warning until that happens.",
  },
  {
    question: "What if SOAP generation fails?",
    answer:
      "The transcript is preserved for recovery. New-session failures also fall back to a transcript-only draft note in Scribe so the visit content is still available.",
  },
  {
    question: "How do trials and billing work?",
    answer:
      "New verified accounts start with a 14-day trial. After the trial ends, regular users need an active $59/month subscription or manually granted access unless they are the configured owner/admin account.",
  },
  {
    question: "How do I know if I have unread internal mail?",
    answer:
      "Mailbox shows an unread badge in the sidebar. Opening an unread inbox message marks it read, and sent mail shows whether the recipient has read it.",
  },
];

const docLinks = [
  {
    title: "Guide",
    description: "Walkthrough for sessions, mailbox, billing, EMR workflow, and recovery behavior.",
    href: "/guide",
    icon: BookOpen,
  },
  {
    title: "What's New",
    description: "Recent product changes that are already live for users.",
    href: "/whats-new",
    icon: LifeBuoy,
  },
];

const quickTopics = [
  {
    title: "Sessions and SOAP",
    text: "Use Stop when the visit is done and you want the note generated now. Use Finish Later only when you want transcript saved without finalizing the chart.",
    icon: Mic,
  },
  {
    title: "Resume and Recovery",
    text: "Resumed notes can be updated without losing prior SOAP. If generation fails, use the recovery tools or reopen the draft note in Scribe.",
    icon: RotateCcw,
  },
  {
    title: "Billing and Access",
    text: "Subscription shows trial status, active billing, invite-code redemption, and manually granted access. Owners keep permanent access.",
    icon: CreditCard,
  },
  {
    title: "Privacy and Admin",
    text: "Owner/admin accounts manage access, internal inbox, invite codes, and other account-level controls.",
    icon: Shield,
  },
];

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background" data-testid="page-support">
      <main className="container mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight">Support</h1>
              <Badge variant="secondary">User Help</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              On-site documentation for account access, note generation, resume flow, billing, and recovery.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/">Back to Home</Link>
            </Button>
            <Button asChild>
              <a href="mailto:support@docuwhisper.com">
                <Mail className="mr-2 h-4 w-4" />
                Email Support
              </a>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {quickTopics.map((topic) => {
            const Icon = topic.icon;
            return (
              <Card key={topic.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-primary" />
                    {topic.title}
                  </CardTitle>
                  <CardDescription>{topic.text}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frequently Asked Questions</CardTitle>
            <CardDescription>
              The main user-facing behaviors that are live in the app right now.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {faqItems.map((item, index) => (
                <AccordionItem value={`item-${index}`} key={item.question}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documentation Links</CardTitle>
            <CardDescription>
              Open the detailed product docs inside the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {docLinks.map((item) => {
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
                  <CardContent className="pt-0">
                    <Button variant="outline" asChild>
                      <Link href={item.href}>Open {item.title}</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Need direct help?</CardTitle>
            <CardDescription>
              For account, billing, technical, or privacy support, contact us directly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Email{" "}
              <a className="text-primary underline underline-offset-4" href="mailto:support@docuwhisper.com">
                support@docuwhisper.com
              </a>
            </p>
            <p>Include your account email and a short description of the issue so the request can be matched to the correct user quickly.</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
