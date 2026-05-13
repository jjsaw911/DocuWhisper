import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone, Sparkles } from "lucide-react";

interface ReleaseNote {
  date: string;
  title: string;
  updates: string[];
}

const RELEASE_NOTES: ReleaseNote[] = [
  {
    date: "March 11, 2026",
    title: "Regular user sign-in and onboarding",
    updates: [
      "Regular users now sign in with their own account instead of sharing an administrator login.",
      "New verified users start with a 14-day trial and get their practice created automatically on first sign-in.",
      "Owner accounts still keep permanent access and can manage the app from Admin.",
    ],
  },
  {
    date: "March 11, 2026",
    title: "Billing and access control",
    updates: [
      "Subscription now shows trial, active, lifetime, and manually granted access states more clearly.",
      "After a trial ends, regular users are routed to billing until they subscribe or receive extended access.",
      "Stripe checkout uses the dedicated DocuWhisper price instead of guessing from the account catalog.",
    ],
  },
  {
    date: "March 11, 2026",
    title: "Mailbox, read tracking, and notifications",
    updates: [
      "Mailbox now shows unread badges in the sidebar, read labels in the inbox, and read receipts for sent messages.",
      "Inbox, sent mail, and the admin internal inbox now support select-all and delete-selected actions.",
      "Unread internal messages can trigger an in-app toast and notification chime after login.",
    ],
  },
  {
    date: "March 11, 2026",
    title: "Session finalization, resume flow, and recovery",
    updates: [
      "Stopping a session now finalizes the visit and generates the SOAP note instead of leaving that work entirely in the background.",
      "Finish Later saves transcript progress without generating SOAP so you can return after testing or additional discussion.",
      "Resumed notes now mark stale SOAP clearly, and failed generation paths preserve transcript recovery more reliably.",
    ],
  },
  {
    date: "March 11, 2026",
    title: "On-site user documentation",
    updates: [
      "Guide now documents Stop vs Finish Later, resumed-note behavior, mailbox read tracking, and recovery workflow.",
      "Help now opens an on-site Support page with user FAQs instead of only linking to email.",
      "Support includes documentation links for Guide and What's New plus direct contact details when human help is needed.",
    ],
  },
  {
    date: "March 11, 2026",
    title: "Admin and EMR workflow polish",
    updates: [
      "Owner/admin access is now tied to the configured owner email so the correct account sees Admin controls.",
      "Copied to EMR status stays synced between the scribe flyout and the note detail page.",
      "Migrated production content now appears under the new account model without losing practice data.",
    ],
  },
  {
    date: "March 3, 2026",
    title: "Scribe and settings improvements",
    updates: [
      "Scribe progress labels use the chief complaint context while notes are generating.",
      "Clinical Settings specialty dropdown now includes Allergy.",
    ],
  },
];

export default function WhatsNew() {
  return (
    <div className="h-full overflow-auto bg-background p-6" data-testid="page-whats-new">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">What's New</h1>
            <Badge variant="secondary">Product Updates</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Recent features and improvements pushed to users.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Release Notes</CardTitle>
            <CardDescription>
              Recent changes that are already live in the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {RELEASE_NOTES.map((release) => (
              <Card key={`${release.date}-${release.title}`} className="border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {release.title}
                  </CardTitle>
                  <CardDescription>{release.date}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-1 text-sm text-muted-foreground">
                  {release.updates.map((update) => (
                    <p key={update}>- {update}</p>
                  ))}
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
