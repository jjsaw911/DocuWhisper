import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Shield, FileText, Lock, AlertTriangle } from "lucide-react";

interface EmrConsentDialogProps {
  open: boolean;
  onConsentGiven: () => void;
}

export function EmrConsentDialog({ open, onConsentGiven }: EmrConsentDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [acknowledged, setAcknowledged] = useState(false);

  const consentMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/emr/consent", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emr/access"] });
      toast({
        title: "Consent Acknowledged",
        description: "You now have access to the Electronic Medical Records system.",
      });
      onConsentGiven();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to acknowledge consent",
        variant: "destructive",
      });
    },
  });

  const handleConsent = () => {
    if (acknowledged) {
      consentMutation.mutate();
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Shield className="h-6 w-6 text-primary" />
            HIPAA Compliance Acknowledgment
          </DialogTitle>
          <DialogDescription>
            Before accessing the Electronic Medical Records (EMR) system, please review and acknowledge the following.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-4">
            <div className="flex gap-3">
              <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">Protected Health Information (PHI)</h4>
                <p className="text-sm text-muted-foreground">
                  You will be accessing protected health information. This information is confidential and must be handled in accordance with HIPAA regulations.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Lock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">Access Logging</h4>
                <p className="text-sm text-muted-foreground">
                  All access to patient records is logged and audited. Your activities in the EMR system, including viewing, creating, editing, and deleting records, will be recorded with timestamps and your user information.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">Responsibilities</h4>
                <p className="text-sm text-muted-foreground">
                  You are responsible for protecting patient privacy, using the minimum necessary information, and reporting any suspected breaches. Unauthorized access or disclosure may result in disciplinary action and legal consequences.
                </p>
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-card">
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent"
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
                data-testid="checkbox-consent"
              />
              <label
                htmlFor="consent"
                className="text-sm cursor-pointer leading-relaxed"
              >
                I acknowledge that I have read and understand the HIPAA privacy and security requirements. I agree to access patient health information only for legitimate treatment, payment, or healthcare operations purposes. I understand that my access to this system is being monitored and logged.
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleConsent}
            disabled={!acknowledged || consentMutation.isPending}
            data-testid="button-acknowledge-consent"
          >
            {consentMutation.isPending ? "Processing..." : "I Acknowledge and Agree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
