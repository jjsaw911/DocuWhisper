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
          Effective date: March 21, 2026
        </p>

        <div className="space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="mb-2 text-lg font-semibold">What We Process</h2>
            <p>
              DocuWhisper processes account details, note content, template data, and audio you intentionally submit for transcription to provide clinical documentation features. When you use AI features, DocuWhisper sends limited data to OpenAI, our third-party AI service provider, to perform speech-to-text transcription and clinical note generation.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">How We Collect Data</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Audio is collected only when you choose to record in the app or web experience.</li>
              <li>Account data is collected when you sign in and use DocuWhisper.</li>
              <li>Patient name, patient context, note content, and template instructions are collected only when you enter or edit them.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">How We Use Data</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Authenticate your account and secure access.</li>
              <li>Send audio to OpenAI for speech-to-text transcription when you use AI features.</li>
              <li>Send transcript text and the note context you provide to OpenAI for SOAP notes and related documentation output.</li>
              <li>Store and sync notes, templates, and app settings.</li>
              <li>Monitor reliability, abuse prevention, and security operations.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Data Handling</h2>
            <p>
              We apply encryption in transit and standard access controls. Your mobile app credentials are stored in iOS Keychain. Audio and text are processed only to provide the features you request and associated service operations. We require our third-party service providers, including OpenAI for AI processing, to protect personal data using safeguards at least equivalent to the protections described in this policy.
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
