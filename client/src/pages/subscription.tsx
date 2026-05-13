import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  SUBSCRIPTION_PLANS,
  type BillingInterval,
  type SubscriptionPlanCode,
} from "@shared/subscriptionPlans";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { capture } from "@/lib/analytics";
import { 
  ArrowLeft, 
  Stethoscope, 
  Check,
  CreditCard,
  Calendar,
  Loader2,
  ExternalLink,
  Crown,
  Gift,
  Shield
} from "lucide-react";

const PUBLIC_CHECKOUT_PLAN_CODES: SubscriptionPlanCode[] = ["unlimited"];

interface SubscriptionData {
  status: string;
  accessState?: "inactive" | "trial" | "active" | "lifetime";
  hasAccess?: boolean;
  currentPeriodEnd?: string;
  stripeSubscriptionId?: string;
  canManageBilling?: boolean;
  plan?: {
    code: string | null;
    name: string;
    monthlyPriceCents: number | null;
    annualPriceCents: number | null;
    monthlyNoteAllowance: number | null;
    billingInterval?: BillingInterval | null;
    unlimited: boolean;
    source: string;
  };
  usage?: {
    currentPeriodCount: number;
    totalCount: number;
    currentPeriodStart: string;
    nextResetAt: string;
    includedCredits: number | null;
    remainingCredits: number | null;
    exhausted: boolean;
  };
}

interface PriceData {
  id: string;
  unit_amount: number | null;
  currency: string;
  recurring?: { interval: BillingInterval };
  productName?: string | null;
}

interface AdminCheckData {
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export default function Subscription() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [inviteCode, setInviteCode] = useState("");
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("month");

  useEffect(() => {
    capture("subscription_view");
  }, []);

  const { data: subscription, isLoading: subLoading, refetch: refetchSub } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
    enabled: !!user,
  });

  const { data: pricesData } = useQuery<{
    prices?: Partial<Record<SubscriptionPlanCode, Partial<Record<BillingInterval, PriceData>>>>;
  }>({
    queryKey: ["/api/stripe/prices"],
    enabled: !!user,
  });

  const { data: adminCheck } = useQuery<AdminCheckData>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({
      planCode,
      billingInterval,
    }: {
      planCode: SubscriptionPlanCode;
      billingInterval: BillingInterval;
    }) => {
      const response = await apiRequest("POST", "/api/stripe/checkout", {
        planCode,
        billingInterval,
      });
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

  const redeemMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await apiRequest("POST", "/api/invites/redeem", { code });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Invite code redeemed!",
        description: `Your membership is now active until ${new Date(data.expiresAt).toLocaleDateString()}`,
      });
      setInviteCode("");
      refetchSub();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to redeem code",
        description: error.message || "Invalid or expired invite code",
        variant: "destructive",
      });
    },
  });

  const accessState = subscription?.accessState || (subscription?.status === "active" ? "active" : "inactive");
  const isTrial = accessState === "trial";
  const isActive = accessState === "active";
  const hasAdminAccess = adminCheck?.isAdmin === true;
  const isSuperAdmin = adminCheck?.isSuperAdmin === true;
  const isLifetime = accessState === "lifetime";
  const canManageBilling = subscription?.canManageBilling === true;
  const currentPlan = subscription?.plan;
  const usage = subscription?.usage;
  const pricesByPlan = pricesData?.prices ?? {};
  const formattedCurrency = (amountCents: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amountCents / 100);
  const formatPriceForPlan = (
    planCode: SubscriptionPlanCode,
    interval: BillingInterval,
    fallbackCents: number,
  ) => {
    const price = pricesByPlan[planCode]?.[interval];
    if (price?.unit_amount != null) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: (price.currency || "usd").toUpperCase(),
      }).format(price.unit_amount / 100);
    }
    return formattedCurrency(fallbackCents);
  };
  const hasAnnualOption = PUBLIC_CHECKOUT_PLAN_CODES.some((planCode) => Boolean(pricesByPlan[planCode]?.year));
  const formattedMonthlyPrice = formatPriceForPlan("unlimited", "month", 5900);
  const formattedAnnualPrice = formatPriceForPlan("unlimited", "year", 59000);
  const currentPlanBillingInterval = currentPlan?.billingInterval ?? "month";
  const currentPlanPriceCents =
    currentPlanBillingInterval === "year"
      ? currentPlan?.annualPriceCents ?? null
      : currentPlan?.monthlyPriceCents ?? null;
  const formattedPlanPrice =
    currentPlanPriceCents != null
      ? formattedCurrency(currentPlanPriceCents)
      : currentPlanBillingInterval === "year"
        ? formattedAnnualPrice
        : formattedMonthlyPrice;
  const shouldShowPlanPrice =
    !hasAdminAccess &&
    !isTrial &&
    !isLifetime &&
    (currentPlanPriceCents != null || accessState === "inactive");
  const checkoutPlans = SUBSCRIPTION_PLANS.filter(
    (plan) =>
      PUBLIC_CHECKOUT_PLAN_CODES.includes(plan.code) &&
      Boolean(pricesByPlan[plan.code]?.[billingInterval]),
  );

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
            {hasAdminAccess && (
              <Card className="border-2 border-primary bg-primary/5" data-testid="card-owner">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {isSuperAdmin ? (
                      <Crown className="h-5 w-5 text-primary" />
                    ) : (
                      <Shield className="h-5 w-5 text-primary" />
                    )}
                    <CardTitle>{isSuperAdmin ? "Super Admin Account" : "Admin Account"}</CardTitle>
                  </div>
                  <CardDescription>
                    {isSuperAdmin
                      ? "You are the DocuWhisper super admin. You have full access to all features and can manage admin roles."
                      : "You have DocuWhisper admin access, including the admin dashboard and protected admin tools."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild data-testid="button-admin-dashboard">
                    <Link href="/admin">
                      <Shield className="mr-2 h-4 w-4" />
                      Open Admin Dashboard
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

              <Card data-testid="card-current-plan">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>Current Plan</CardTitle>
                  <Badge variant={hasAdminAccess || isActive ? "default" : "secondary"}>
                    {hasAdminAccess
                      ? isSuperAdmin
                        ? "Super Admin"
                        : "Admin"
                      : isLifetime
                        ? "Lifetime"
                        : isTrial
                          ? "Trial"
                          : isActive
                            ? "Active"
                            : "Inactive"}
                  </Badge>
                </div>
                <CardDescription>
                  {hasAdminAccess
                    ? isSuperAdmin
                      ? "As the super admin, you have permanent full access to DocuWhisper"
                      : "As an admin, you have full access to DocuWhisper and the admin dashboard"
                    : isTrial
                    ? "You're on your 14-day free trial. Subscribe before it ends to keep access."
                    : isActive
                    ? "You have full access to all DocuWhisper features"
                    : "Your trial has ended. Subscribe to continue using DocuWhisper."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-3">
                  <div className="text-lg font-semibold">{currentPlan?.name || "No Active Plan"}</div>
                  {currentPlan?.monthlyNoteAllowance != null ? (
                    <p className="text-sm text-muted-foreground">
                      Includes {currentPlan.monthlyNoteAllowance} AI note credits each billing cycle.
                    </p>
                  ) : currentPlan?.unlimited ? (
                    <p className="text-sm text-muted-foreground">Unlimited AI note credits.</p>
                  ) : null}
                </div>
                {shouldShowPlanPrice && (
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-4xl font-bold">
                      {formattedPlanPrice}
                    </span>
                    <span className="text-muted-foreground">
                      /{currentPlanBillingInterval === "year" ? "year" : "month"}
                    </span>
                  </div>
                )}
                {currentPlanBillingInterval === "year" && isActive && (
                  <p className="mb-4 text-sm text-muted-foreground">Billed annually.</p>
                )}
                {(isActive || isTrial) && subscription?.currentPeriodEnd && !isLifetime && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {isTrial ? "Trial ends on" : "Renews on"}{" "}
                      {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {isLifetime && (
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Crown className="h-4 w-4" />
                    <span>Lifetime membership - never expires</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {usage && (subscription?.hasAccess || hasAdminAccess) && (
              <Card data-testid="card-usage">
                <CardHeader>
                  <CardTitle>Usage This Cycle</CardTitle>
                  <CardDescription>
                    {usage.nextResetAt
                      ? `Usage resets on ${new Date(usage.nextResetAt).toLocaleDateString()}`
                      : "Track how many billable AI notes you have left this cycle."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-lg border p-4">
                      <div className="text-sm text-muted-foreground">Notes used</div>
                      <div className="text-3xl font-semibold">{usage.currentPeriodCount}</div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className="text-sm text-muted-foreground">
                        {usage.remainingCredits == null ? "Credits remaining" : "Notes remaining"}
                      </div>
                      <div className="text-3xl font-semibold">
                        {usage.remainingCredits == null ? "Unlimited" : usage.remainingCredits}
                      </div>
                    </div>
                  </div>
                  {usage.includedCredits != null && (
                    <p className="text-sm text-muted-foreground">
                      Included this cycle: {usage.includedCredits} note credits.
                    </p>
                  )}
                  {usage.exhausted && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      You have used all included note credits for this billing cycle. Upgrade, add credits, or wait
                      until the cycle resets to save more AI-generated notes.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {isActive && !hasAdminAccess && canManageBilling ? (
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
            ) : isActive && !hasAdminAccess ? (
              <Card data-testid="card-access-granted">
                <CardHeader>
                  <CardTitle>Access Enabled</CardTitle>
                  <CardDescription>
                    Your access was granted manually. Billing is not managed through Stripe for this account.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : !hasAdminAccess && (
              <>
                <Card className="border-2 border-primary" data-testid="card-subscribe">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-primary" />
                      Subscribe
                    </CardTitle>
                    <CardDescription>
                      {isTrial
                        ? "Keep your access active after the free trial ends"
                        : "Choose monthly or annual billing for full DocuWhisper access"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {hasAnnualOption && (
                      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                        <Button
                          type="button"
                          variant={billingInterval === "month" ? "default" : "ghost"}
                          onClick={() => setBillingInterval("month")}
                          className="w-full"
                          data-testid="button-billing-monthly"
                        >
                          Monthly
                        </Button>
                        <Button
                          type="button"
                          variant={billingInterval === "year" ? "default" : "ghost"}
                          onClick={() => setBillingInterval("year")}
                          className="w-full"
                          data-testid="button-billing-annual"
                        >
                          Annual
                        </Button>
                      </div>
                    )}
                    {hasAnnualOption && billingInterval === "year" && (
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
                        Annual billing saves $118 compared with paying monthly for 12 months.
                      </div>
                    )}
                    {checkoutPlans.length > 0 ? (
                      <div className="grid gap-4">
                        {checkoutPlans.map((plan) => {
                          const isCurrentPlan = currentPlan?.code === plan.code && isActive;
                          const fallbackPriceCents =
                            billingInterval === "year"
                              ? plan.annualPriceCents ?? plan.monthlyPriceCents * 10
                              : plan.monthlyPriceCents;
                          return (
                            <div
                              key={plan.code}
                              className={`rounded-lg border p-4 ${
                                plan.code === "unlimited" ? "border-primary bg-primary/5" : ""
                              }`}
                            >
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-lg font-semibold">{plan.name}</div>
                                  <div className="text-sm text-muted-foreground">{plan.description}</div>
                                </div>
                                {isCurrentPlan && <Badge>Current</Badge>}
                              </div>
                              <div className="mb-3 flex items-baseline gap-1">
                                <span className="text-3xl font-bold">
                                  {formatPriceForPlan(plan.code, billingInterval, fallbackPriceCents)}
                                </span>
                                <span className="text-muted-foreground">
                                  /{billingInterval === "year" ? "year" : "month"}
                                </span>
                              </div>
                              {billingInterval === "year" && (
                                <p className="mb-3 text-sm text-muted-foreground">
                                  Pay once for the year and keep full access active.
                                </p>
                              )}
                              <ul className="mb-4 space-y-2 text-sm">
                                <li className="flex items-center gap-2">
                                  <Check className="h-4 w-4 text-primary" />
                                  {plan.monthlyNoteAllowance == null
                                    ? "Unlimited AI note credits"
                                    : `${plan.monthlyNoteAllowance} AI note credits / month`}
                                </li>
                                <li className="flex items-center gap-2">
                                  <Check className="h-4 w-4 text-primary" />
                                  Unlimited recordings and transcripts
                                </li>
                                <li className="flex items-center gap-2">
                                  <Check className="h-4 w-4 text-primary" />
                                  Specialty templates, exports, and secure storage
                                </li>
                              </ul>
                              <Button
                                onClick={() => {
                                  capture("subscribe_click", { plan_code: plan.code, billing_interval: billingInterval });
                                  checkoutMutation.mutate({
                                    planCode: plan.code,
                                    billingInterval,
                                  });
                                }}
                                disabled={checkoutMutation.isPending || isCurrentPlan}
                                className="w-full"
                                data-testid={`button-subscribe-${plan.code}`}
                              >
                                {checkoutMutation.isPending ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                  </>
                                ) : isCurrentPlan ? (
                                  "Current Plan"
                                ) : isTrial ? (
                                  billingInterval === "year"
                                    ? "Continue with Annual Access"
                                    : "Continue with Monthly Access"
                                ) : (
                                  billingInterval === "year"
                                    ? "Subscribe for $590/year"
                                    : "Subscribe for $59/month"
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
                        Stripe pricing is not configured yet. Add the live {billingInterval === "year" ? "annual" : "monthly"} Stripe price ID to enable checkout.
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground text-center">
                      Cancel anytime. Invite codes and manually granted memberships still work for free access.
                    </p>
                  </CardContent>
                </Card>

                <Card data-testid="card-invite">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="h-5 w-5 text-primary" />
                      Have an Invite Code?
                    </CardTitle>
                    <CardDescription>
                      Enter your invite code to activate your membership
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="Enter invite code"
                          value={inviteCode}
                          onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                          data-testid="input-invite-code"
                        />
                      </div>
                      <Button
                        onClick={() => redeemMutation.mutate(inviteCode)}
                        disabled={redeemMutation.isPending || !inviteCode}
                        data-testid="button-redeem"
                      >
                        {redeemMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Redeem"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
