import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { 
  ArrowLeft, 
  Stethoscope, 
  Check,
  CreditCard,
  Calendar,
  Loader2,
  ExternalLink
} from "lucide-react";

interface SubscriptionData {
  status: string;
  currentPeriodEnd?: string;
  stripeSubscriptionId?: string;
}

interface PriceData {
  id: string;
  unit_amount: number;
  currency: string;
  recurring?: { interval: string };
}

export default function Subscription() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: subscription, isLoading: subLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    enabled: !!user,
  });

  const { data: priceData, isLoading: priceLoading } = useQuery<{ price?: PriceData }>({
    queryKey: ["/api/stripe/price"],
    enabled: !!user,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/checkout");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Checkout failed",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/portal");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Failed to open billing portal",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const isActive = subscription?.status === "active";
  const price = priceData?.price;

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="p-6 max-w-2xl mx-auto">
        {subLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card data-testid="card-current-plan">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Current Plan</CardTitle>
                  <Badge variant={isActive ? "default" : "secondary"}>
                    {isActive ? "Active" : "Trial"}
                  </Badge>
                </div>
                <CardDescription>
                  {isActive
                    ? "You have full access to all DocuWhisper features"
                    : "You're on the free trial. Subscribe to unlock all features"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-4xl font-bold">$25</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                {isActive && subscription?.currentPeriodEnd && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Renews on {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {isActive ? (
              <Card data-testid="card-manage">
                <CardHeader>
                  <CardTitle>Manage Subscription</CardTitle>
                  <CardDescription>
                    Update payment method, view invoices, or cancel your subscription
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => portalMutation.mutate()}
                    disabled={portalMutation.isPending}
                    className="w-full sm:w-auto"
                    data-testid="button-manage"
                  >
                    {portalMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Opening...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open Billing Portal
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-2 border-primary" data-testid="card-subscribe">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Subscribe to Professional
                  </CardTitle>
                  <CardDescription>
                    Unlock unlimited access to all features
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3 mb-6">
                    {[
                      "Unlimited voice recordings",
                      "Unlimited SOAP notes",
                      "All specialty templates",
                      "Priority AI processing",
                      "Export to PDF/Word",
                      "Secure cloud storage",
                      "Email support"
                    ].map((feature, i) => (
                      <li key={i} className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => checkoutMutation.mutate()}
                    disabled={checkoutMutation.isPending}
                    className="w-full"
                    size="lg"
                    data-testid="button-subscribe"
                  >
                    {checkoutMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        Subscribe for $25/month
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-4">
                    Cancel anytime. No hidden fees.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
