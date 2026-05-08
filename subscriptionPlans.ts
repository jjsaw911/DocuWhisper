export type SubscriptionPlanCode = "starter" | "standard" | "pro" | "unlimited";

export type SubscriptionPlanDefinition = {
  code: SubscriptionPlanCode;
  name: string;
  monthlyPriceCents: number;
  monthlyNoteAllowance: number | null;
  description: string;
};

export const SUBSCRIPTION_PLAN_DEFINITIONS: Record<
  SubscriptionPlanCode,
  SubscriptionPlanDefinition
> = {
  starter: {
    code: "starter",
    name: "Starter",
    monthlyPriceCents: 1900,
    monthlyNoteAllowance: 15,
    description: "For light usage and occasional documentation.",
  },
  standard: {
    code: "standard",
    name: "Standard",
    monthlyPriceCents: 3900,
    monthlyNoteAllowance: 40,
    description: "For steady month-to-month note generation.",
  },
  pro: {
    code: "pro",
    name: "Pro",
    monthlyPriceCents: 5900,
    monthlyNoteAllowance: 80,
    description: "For heavier clinical usage with headroom.",
  },
  unlimited: {
    code: "unlimited",
    name: "Solo",
    monthlyPriceCents: 5900,
    monthlyNoteAllowance: null,
    description: "Full DocuWhisper access with unlimited note generations.",
  },
};

export const SUBSCRIPTION_PLANS = Object.values(SUBSCRIPTION_PLAN_DEFINITIONS);

export const DEFAULT_SUBSCRIPTION_PLAN_CODE: SubscriptionPlanCode = "unlimited";

export function getSubscriptionPlanDefinition(
  code: string | null | undefined,
): SubscriptionPlanDefinition | null {
  if (!code) return null;
  return SUBSCRIPTION_PLAN_DEFINITIONS[code as SubscriptionPlanCode] ?? null;
}
