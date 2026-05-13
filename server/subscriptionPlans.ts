import type { Subscription } from "@shared/schema";
import {
  DEFAULT_SUBSCRIPTION_PLAN_CODE,
  getSubscriptionPlanDefinition,
  type SubscriptionPlanCode,
} from "@shared/subscriptionPlans";
import type { NoteCreditUsageSummary } from "./noteCreditUsage";
import { getSubscriptionAccessState, type SubscriptionAccessState } from "./subscriptionAccess";

export type EffectivePlanSource =
  | "super_admin"
  | "admin"
  | "trial"
  | "lifetime"
  | "plan"
  | "manual"
  | "inactive";

export type EffectiveSubscriptionPlan = {
  code: SubscriptionPlanCode | "trial" | "lifetime" | "super_admin" | "admin" | "manual" | null;
  name: string;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  monthlyNoteAllowance: number | null;
  unlimited: boolean;
  source: EffectivePlanSource;
};

export type NoteCreditUsageState = NoteCreditUsageSummary & {
  includedCredits: number | null;
  remainingCredits: number | null;
  exhausted: boolean;
};

export type NoteCreditEntitlement = {
  accessState: SubscriptionAccessState;
  hasAccess: boolean;
  plan: EffectiveSubscriptionPlan;
  usage: NoteCreditUsageState;
  canConsumeCredit: boolean;
  reason: "inactive" | "out_of_credits" | null;
};

export function isOwnerEmail(email: string | null | undefined): boolean {
  const configuredOwnerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase() || "";
  const normalizedEmail = email?.trim().toLowerCase() || "";
  return Boolean(configuredOwnerEmail && normalizedEmail && configuredOwnerEmail === normalizedEmail);
}

export function getEffectiveSubscriptionPlan(
  subscription: Subscription | undefined,
  options?: { isAdmin?: boolean; isSuperAdmin?: boolean },
): EffectiveSubscriptionPlan {
  const isAdmin = options?.isAdmin === true;
  const isSuperAdmin = options?.isSuperAdmin === true;
  const accessState = getSubscriptionAccessState(subscription);
  const configuredPlan = getSubscriptionPlanDefinition(subscription?.planCode);

  if (isSuperAdmin) {
    return {
      code: "super_admin",
      name: "Super Admin Access",
      monthlyPriceCents: null,
      annualPriceCents: null,
      monthlyNoteAllowance: null,
      unlimited: true,
      source: "super_admin",
    };
  }

  if (isAdmin) {
    return {
      code: "admin",
      name: "Admin Access",
      monthlyPriceCents: null,
      annualPriceCents: null,
      monthlyNoteAllowance: null,
      unlimited: true,
      source: "admin",
    };
  }

  if (accessState === "trial") {
    return {
      code: "trial",
      name: "Free Trial",
      monthlyPriceCents: null,
      annualPriceCents: null,
      monthlyNoteAllowance: null,
      unlimited: true,
      source: "trial",
    };
  }

  if (accessState === "lifetime") {
    return {
      code: "lifetime",
      name: "Lifetime Access",
      monthlyPriceCents: null,
      annualPriceCents: null,
      monthlyNoteAllowance: null,
      unlimited: true,
      source: "lifetime",
    };
  }

  if (configuredPlan) {
    return {
      code: configuredPlan.code,
      name: configuredPlan.name,
      monthlyPriceCents: configuredPlan.monthlyPriceCents,
      annualPriceCents: configuredPlan.annualPriceCents,
      monthlyNoteAllowance: configuredPlan.monthlyNoteAllowance,
      unlimited: configuredPlan.monthlyNoteAllowance == null,
      source: "plan",
    };
  }

  if (subscription?.status === "active") {
    if (subscription.stripeSubscriptionId || subscription.stripeCustomerId) {
      const legacyPaidPlan = getSubscriptionPlanDefinition(DEFAULT_SUBSCRIPTION_PLAN_CODE);
      if (legacyPaidPlan) {
        return {
          code: legacyPaidPlan.code,
          name: legacyPaidPlan.name,
          monthlyPriceCents: legacyPaidPlan.monthlyPriceCents,
          annualPriceCents: legacyPaidPlan.annualPriceCents,
          monthlyNoteAllowance: legacyPaidPlan.monthlyNoteAllowance,
          unlimited: legacyPaidPlan.monthlyNoteAllowance == null,
          source: "plan",
        };
      }
    }

    return {
      code: "manual",
      name: "Granted Access",
      monthlyPriceCents: null,
      annualPriceCents: null,
      monthlyNoteAllowance: null,
      unlimited: true,
      source: "manual",
    };
  }

  return {
    code: null,
    name: "No Active Plan",
    monthlyPriceCents: null,
    annualPriceCents: null,
    monthlyNoteAllowance: null,
    unlimited: false,
    source: "inactive",
  };
}

export function getNoteCreditEntitlement(params: {
  subscription: Subscription | undefined;
  usage: NoteCreditUsageSummary;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  noteAlreadyConsumed?: boolean;
}): NoteCreditEntitlement {
  const hasAdminAccess = params.isAdmin === true || params.isSuperAdmin === true;
  const accessState = hasAdminAccess ? "active" : getSubscriptionAccessState(params.subscription);
  const hasAccess = hasAdminAccess || accessState !== "inactive";
  const plan = getEffectiveSubscriptionPlan(params.subscription, {
    isAdmin: params.isAdmin,
    isSuperAdmin: params.isSuperAdmin,
  });
  const includedCredits = plan.unlimited ? null : plan.monthlyNoteAllowance ?? 0;
  const remainingCredits =
    includedCredits == null ? null : Math.max(includedCredits - params.usage.currentPeriodCount, 0);
  const exhausted = remainingCredits != null && remainingCredits <= 0;
  const noteAlreadyConsumed = params.noteAlreadyConsumed === true;
  const canConsumeCredit =
    hasAccess && (noteAlreadyConsumed || plan.unlimited || (remainingCredits != null && remainingCredits > 0));

  return {
    accessState,
    hasAccess,
    plan,
    usage: {
      ...params.usage,
      includedCredits,
      remainingCredits,
      exhausted,
    },
    canConsumeCredit,
    reason: !hasAccess ? "inactive" : !canConsumeCredit ? "out_of_credits" : null,
  };
}
