import { useState, useMemo, useEffect, useRef } from "react";
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
import { AlertTriangle, ChevronDown, ChevronUp, Pill, Shield, Sparkles, Loader2 } from "lucide-react";
import { analyzeTextForInteractions, DrugInteraction, InteractionSeverity } from "@/lib/drug-interactions";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  const [isCheckingAI, setIsCheckingAI] = useState(false);
  const [aiInteractions, setAiInteractions] = useState<DrugInteraction[]>([]);
  const [hasCheckedAI, setHasCheckedAI] = useState(false);
  const { toast } = useToast();
  
  // Track which medication set was last successfully checked
  const lastCheckedMedsRef = useRef<string>("");
  const latestMedsRef = useRef<{ key: string; meds: string[] }>({ key: "", meds: [] });
  const requestIdRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const analysis = useMemo(() => {
    return analyzeTextForInteractions(text);
  }, [text]);

  const { medications, interactions: dbInteractions } = analysis;
  
  // Create a stable medication key for comparison
  const medicationKey = useMemo(() => [...medications].sort().join(','), [medications]);

  // Always keep latestMedsRef current
  useEffect(() => {
    latestMedsRef.current = { key: medicationKey, meds: [...medications] };
  }, [medicationKey, medications]);

  // Auto-run AI check when medications change
  useEffect(() => {
    // Reset state when medications change from a previously checked set
    if (lastCheckedMedsRef.current !== "" && medicationKey !== lastCheckedMedsRef.current) {
      setAiInteractions([]);
      setHasCheckedAI(false);
    }
    
    // Only check if we have 2+ medications and not already checked
    if (medications.length < 2 || medicationKey === lastCheckedMedsRef.current) {
      return;
    }
    
    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Schedule the check
    debounceTimerRef.current = setTimeout(async () => {
      // Get the latest meds at time of check (not the ones from when effect ran)
      const { key: currentKey, meds: currentMeds } = latestMedsRef.current;
      
      // Skip if already checked or not enough meds
      if (currentKey === lastCheckedMedsRef.current || currentMeds.length < 2) {
        return;
      }
      
      const thisRequestId = ++requestIdRef.current;
      setIsCheckingAI(true);
      
      try {
        const response = await apiRequest("POST", "/api/ai-drug-interactions", { medications: currentMeds });
        const data = await response.json();
        
        // Ignore stale responses
        if (thisRequestId !== requestIdRef.current) return;
        
        // Filter out interactions where both drugs are the same (with null safety)
        const validInteractions = (data.interactions || []).filter(
          (i: DrugInteraction) => {
            const d1 = (i.drug1 || "").toLowerCase();
            const d2 = (i.drug2 || "").toLowerCase();
            return d1 && d2 && d1 !== d2;
          }
        );
        
        setAiInteractions(validInteractions);
        setHasCheckedAI(true);
        lastCheckedMedsRef.current = currentKey;
        
        // Check if meds changed during the request
        const latest = latestMedsRef.current;
        if (latest.key !== currentKey && latest.meds.length >= 2 && latest.key !== lastCheckedMedsRef.current) {
          // Trigger a new check for the latest meds
          requestIdRef.current++;
          setIsCheckingAI(false);
          // Effect will re-run due to medications change
        }
      } catch (error) {
        if (thisRequestId !== requestIdRef.current) return;
        console.error("AI check error:", error);
        // Don't mark as checked - allow retry on next effect trigger
      } finally {
        if (thisRequestId === requestIdRef.current) {
          setIsCheckingAI(false);
        }
      }
    }, 800);
    
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [medicationKey, medications]);

  // Combine database and AI interactions, filtering out same-drug entries
  const allInteractions = useMemo(() => {
    const combined = [...dbInteractions];
    aiInteractions.forEach(ai => {
      // Skip if drugs are null or the same
      const d1 = (ai.drug1 || "").toLowerCase();
      const d2 = (ai.drug2 || "").toLowerCase();
      if (!d1 || !d2 || d1 === d2) return;
      
      const exists = combined.some(
        db => (db.drug1 === ai.drug1 && db.drug2 === ai.drug2) || 
              (db.drug1 === ai.drug2 && db.drug2 === ai.drug1)
      );
      if (!exists) {
        combined.push(ai);
      }
    });
    // Filter out any same-drug interactions from the combined list (with null safety)
    return combined.filter(i => {
      const d1 = (i.drug1 || "").toLowerCase();
      const d2 = (i.drug2 || "").toLowerCase();
      return d1 && d2 && d1 !== d2;
    });
  }, [dbInteractions, aiInteractions]);

  // Sort interactions by severity
  const sortedInteractions = useMemo(() => {
    const severityOrder: Record<InteractionSeverity, number> = {
      high: 0,
      moderate: 1,
      low: 2,
    };
    return [...allInteractions].sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
  }, [allInteractions]);

  const highCount = allInteractions.filter((i) => i.severity === "high").length;
  const moderateCount = allInteractions.filter((i) => i.severity === "moderate").length;

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

      {/* AI Check Status */}
      {medications.length >= 2 && isCheckingAI && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Analyzing interactions...</span>
        </div>
      )}

      {/* Interactions alert */}
      {allInteractions.length > 0 && (
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
                Drug Interactions Detected ({allInteractions.length})
                {aiInteractions.length > 0 && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Enhanced
                  </Badge>
                )}
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
      {medications.length > 1 && allInteractions.length === 0 && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <Shield className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-700 dark:text-green-400">
            No Known Interactions
          </AlertTitle>
          <AlertDescription className="text-green-600 dark:text-green-500">
            No significant drug interactions detected between the listed medications.
            {hasCheckedAI && (
              <span className="block mt-1 text-green-500">
                <Sparkles className="h-3 w-3 inline mr-1" />
                AI-verified analysis complete.
              </span>
            )}
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
