import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Support</h1>
          <Button variant="outline" asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>

        <div className="space-y-4 text-sm leading-7">
          <p>
            For account, billing, technical, or privacy support, contact:
          </p>
          <p>
            <a className="text-primary underline underline-offset-4" href="mailto:support@docuwhisper.com">
              support@docuwhisper.com
            </a>
          </p>
          <p className="text-muted-foreground">
            Include your account email and a short description of the issue so we can respond faster.
          </p>
        </div>
      </main>
    </div>
  );
}
