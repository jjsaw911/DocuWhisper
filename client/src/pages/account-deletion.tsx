import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Account Deletion</h1>
          <Button variant="outline" asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          Last updated: March 3, 2026
        </p>

        <div className="space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="mb-2 text-lg font-semibold">Delete Your Account In-App (Recommended)</h2>
            <ol className="list-decimal space-y-2 pl-6">
              <li>Open the DocuWhisper iOS app.</li>
              <li>Go to <strong>Settings</strong>.</li>
              <li>Tap <strong>Delete Account</strong>.</li>
              <li>Confirm the deletion prompt.</li>
            </ol>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">What Is Deleted</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Account profile and user settings</li>
              <li>Notes, templates, and tasks associated with the account</li>
              <li>Active personal API keys</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Need Help?</h2>
            <p>
              If you cannot access the app, email{" "}
              <a className="text-primary underline underline-offset-4" href="mailto:support@docuwhisper.com">
                support@docuwhisper.com
              </a>{" "}
              from your account email and request deletion.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
