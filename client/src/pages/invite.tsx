import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useParams, useLocation } from "wouter";
import { Gift, Check, Loader2, AlertCircle, LogIn } from "lucide-react";

interface RedeemResponse {
  message: string;
  subscription: {
    status: string;
    currentPeriodEnd: string;
  };
}

export default function Invite() {
  const { code } = useParams<{ code: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const redeemMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/invites/redeem", { code });
      return response.json() as Promise<RedeemResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({
        title: "Invitation accepted!",
        description: data.message,
      });
      setTimeout(() => setLocation("/"), 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to redeem invite",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Gift className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">You're Invited!</CardTitle>
            <CardDescription className="text-base">
              Sign in to accept your DocuWhisper invitation and start saving hours on medical documentation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-center text-muted-foreground">
                Invite Code: <code className="font-mono font-semibold text-primary">{code}</code>
              </p>
            </div>
            <Button asChild className="w-full" size="lg" data-testid="button-login-to-accept">
              <a href="/api/login">
                <LogIn className="mr-2 h-5 w-5" />
                Sign In to Accept Invitation
              </a>
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              You can sign in with Google, GitHub, or email using Replit Auth.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (redeemMutation.isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl text-green-600 dark:text-green-400">Welcome to DocuWhisper!</CardTitle>
            <CardDescription className="text-base">
              Your invitation has been accepted. Redirecting you to the app...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (redeemMutation.isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Invitation Issue</CardTitle>
            <CardDescription className="text-base">
              This invitation code may have already been used or is invalid.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => setLocation("/")} className="w-full" data-testid="button-go-home">
              Go to DocuWhisper
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Gift className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Accept Your Invitation</CardTitle>
          <CardDescription className="text-base">
            You've been invited to use DocuWhisper. Click below to activate your membership.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-center text-muted-foreground">
              Invite Code: <code className="font-mono font-semibold text-primary">{code}</code>
            </p>
          </div>
          <Button 
            onClick={() => redeemMutation.mutate()} 
            disabled={redeemMutation.isPending}
            className="w-full" 
            size="lg"
            data-testid="button-accept-invite"
          >
            {redeemMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <Gift className="mr-2 h-5 w-5" />
                Accept Invitation
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
