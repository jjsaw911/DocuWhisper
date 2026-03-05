import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <Button variant="outline" asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          Effective date: March 3, 2026
        </p>

        <div className="space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="mb-2 text-lg font-semibold">What We Process</h2>
            <p>
              DocuWhisper processes account details, note content, template data, and audio you submit for transcription to provide clinical documentation features.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">How We Use Data</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Authenticate your account and secure access.</li>
              <li>Generate transcripts, SOAP notes, and related documentation output.</li>
              <li>Store and sync notes, templates, and app settings.</li>
              <li>Monitor reliability, abuse prevention, and security operations.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Data Handling</h2>
            <p>
              We apply encryption in transit and standard access controls. Your mobile app credentials are stored in iOS Keychain. Audio and text are processed to provide requested features and associated service operations.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Your Controls</h2>
            <p>
              You can sign out at any time and permanently delete your account and associated data from the iOS app Settings screen or via instructions on the{" "}
              <Link href="/account-deletion" className="text-primary underline underline-offset-4">
                Account Deletion
              </Link>{" "}
              page.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Contact</h2>
            <p>
              Privacy questions:{" "}
              <a className="text-primary underline underline-offset-4" href="mailto:support@docuwhisper.com">
                support@docuwhisper.com
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
