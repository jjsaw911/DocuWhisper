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
    date: "March 3, 2026",
    title: "Mailbox safety and discoverability",
    updates: [
      "Mailbox now supports recipient search by name, email, or User ID.",
      "Recipient selection now requires explicit confirmation before sending.",
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
              Update this list as new features are released.
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
