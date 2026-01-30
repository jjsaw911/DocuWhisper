import { useState, useEffect, useMemo } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, ChevronUp, Pill, Shield } from "lucide-react";
import { analyzeTextForInteractions, DrugInteraction, InteractionSeverity } from "@/lib/drug-interactions";
import { cn } from "@/lib/utils";

interface DrugInteractionAlertProps {
  text: string;
  className?: string;
}

const severityColors: Record<InteractionSeverity, string> = {
  high: "bg-destructive text-destructive-foreground",
  moderate: "bg-amber-500 text-white dark:bg-amber-600",
  low: "bg-blue-500 text-white dark:bg-blue-600",
};

const severityBorderColors: Record<InteractionSeverity, string> = {
  high: "border-destructive",
  moderate: "border-amber-500",
  low: "border-blue-500",
};

export function DrugInteractionAlert({ text, className }: DrugInteractionAlertProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const analysis = useMemo(() => {
    return analyzeTextForInteractions(text);
  }, [text]);

  const { medications, interactions } = analysis;

  // Sort interactions by severity
  const sortedInteractions = useMemo(() => {
    const severityOrder: Record<InteractionSeverity, number> = {
      high: 0,
      moderate: 1,
      low: 2,
    };
    return [...interactions].sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
  }, [interactions]);

  const highCount = interactions.filter((i) => i.severity === "high").length;
  const moderateCount = interactions.filter((i) => i.severity === "moderate").length;

  if (medications.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Medications detected */}
      <div className="flex items-center gap-2 flex-wrap">
        <Pill className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Medications detected:</span>
        {medications.map((med) => (
          <Badge
            key={med}
            variant="secondary"
            className="text-xs capitalize"
            data-testid={`medication-badge-${med}`}
          >
            {med}
          </Badge>
        ))}
      </div>

      {/* Interactions alert */}
      {interactions.length > 0 && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <Alert
            variant="destructive"
            className={cn(
              "border-2",
              highCount > 0 ? severityBorderColors.high : severityBorderColors.moderate
            )}
          >
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="flex items-center justify-between">
              <span>
                Drug Interactions Detected ({interactions.length})
              </span>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="toggle-interactions">
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </AlertTitle>
            <AlertDescription>
              <div className="flex gap-2 mt-1">
                {highCount > 0 && (
                  <Badge className={severityColors.high}>
                    {highCount} High Risk
                  </Badge>
                )}
                {moderateCount > 0 && (
                  <Badge className={severityColors.moderate}>
                    {moderateCount} Moderate
                  </Badge>
                )}
              </div>

              <CollapsibleContent className="mt-3 space-y-3">
                {sortedInteractions.map((interaction, index) => (
                  <InteractionCard
                    key={`${interaction.drug1}-${interaction.drug2}-${index}`}
                    interaction={interaction}
                  />
                ))}
              </CollapsibleContent>
            </AlertDescription>
          </Alert>
        </Collapsible>
      )}

      {/* No interactions - safe */}
      {medications.length > 1 && interactions.length === 0 && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <Shield className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-700 dark:text-green-400">
            No Known Interactions
          </AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-500">
            No significant drug interactions detected between the listed medications.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function InteractionCard({ interaction }: { interaction: DrugInteraction }) {
  return (
    <div
      className={cn(
        "p-3 rounded-md border-l-4",
        severityBorderColors[interaction.severity],
        "bg-background/50"
      )}
      data-testid={`interaction-${interaction.drug1}-${interaction.drug2}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Badge className={cn("text-xs", severityColors[interaction.severity])}>
          {interaction.severity.toUpperCase()}
        </Badge>
        <span className="font-medium text-sm capitalize">
          {interaction.drug1} + {interaction.drug2}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-1">
        {interaction.description}
      </p>
      <p className="text-sm font-medium text-foreground">
        <span className="text-muted-foreground">Recommendation:</span>{" "}
        {interaction.recommendation}
      </p>
    </div>
  );
}

// Standalone dialog version for detailed view
interface DrugInteractionDialogProps {
  text: string;
  trigger?: React.ReactNode;
}

export function DrugInteractionDialog({ text, trigger }: DrugInteractionDialogProps) {
  const analysis = useMemo(() => {
    return analyzeTextForInteractions(text);
  }, [text]);

  const { medications, interactions } = analysis;

  if (medications.length === 0) {
    return null;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              interactions.length > 0 && "border-destructive text-destructive"
            )}
            data-testid="open-drug-interactions"
          >
            <Pill className="h-4 w-4 mr-2" />
            Check Interactions
            {interactions.length > 0 && (
              <Badge variant="destructive" className="ml-2">
                {interactions.length}
              </Badge>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            Drug Interaction Check
          </DialogTitle>
          <DialogDescription>
            Analysis of medications mentioned in the clinical note
          </DialogDescription>
        </DialogHeader>

        <DrugInteractionAlert text={text} />
      </DialogContent>
    </Dialog>
  );
}
