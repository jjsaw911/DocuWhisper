import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
          <Button variant="outline" asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          Effective date: March 3, 2026
        </p>

        <div className="space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="mb-2 text-lg font-semibold">Service Purpose</h2>
            <p>
              DocuWhisper is a documentation-assistance platform for clinical workflows. You are responsible for reviewing all generated content before clinical use.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Acceptable Use</h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>Use the service lawfully and in compliance with professional obligations.</li>
              <li>Protect account credentials and patient-sensitive information.</li>
              <li>Do not attempt to misuse, disrupt, or reverse engineer the service.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Healthcare Responsibility</h2>
            <p>
              DocuWhisper does not replace clinical judgment. You remain responsible for diagnosis, treatment decisions, record accuracy, and regulatory compliance.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Account and Termination</h2>
            <p>
              You may stop using the service at any time. Account deletion is available in-app and through the{" "}
              <Link href="/account-deletion" className="text-primary underline underline-offset-4">
                Account Deletion
              </Link>{" "}
              page.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Contact</h2>
            <p>
              Questions about these terms:{" "}
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
