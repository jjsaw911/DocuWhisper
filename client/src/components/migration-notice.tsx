import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, Server } from "lucide-react";

const MIGRATION_HOSTS = new Set(["docuwhisper.com", "www.docuwhisper.com"]);
const BETA_URL = "https://beta.docuwhisper.com";

function shouldShowMigrationNotice(): boolean {
  if (typeof window === "undefined") return false;
  return MIGRATION_HOSTS.has(window.location.hostname.toLowerCase());
}

interface MigrationNoticeProps {
  compact?: boolean;
  className?: string;
}

export function MigrationNotice({ compact = false, className }: MigrationNoticeProps) {
  if (!shouldShowMigrationNotice()) {
    return null;
  }

  return (
    <Alert
      className={cn(
        "border-primary/30 bg-primary/5 text-left",
        compact && "rounded-none border-x-0 border-t-0",
        className,
      )}
      data-testid="migration-notice"
    >
      <div className={cn("flex items-start gap-3", compact ? "flex-col md:flex-row md:items-center" : "flex-col")}>
        <Server className="mt-0.5 h-4 w-4 text-primary" />
        <div className="flex-1 space-y-1">
          <AlertTitle>Migration to the new DocuWhisper server is in progress.</AlertTitle>
          <AlertDescription className="text-sm leading-6">
            New accounts and ongoing use should move to{" "}
            <a className="font-medium text-primary underline underline-offset-4" href={BETA_URL}>
              beta.docuwhisper.com
            </a>{" "}
            while the migration is completed. Once cutover is finished,{" "}
            <span className="font-medium text-foreground">docuwhisper.com</span> will point to the same new environment
            automatically.
          </AlertDescription>
        </div>
        <Button asChild className={cn("shrink-0", compact && "mt-1 md:mt-0")} size={compact ? "sm" : "default"}>
          <a href={BETA_URL}>
            Open Beta
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </Alert>
  );
}
