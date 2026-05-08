import type { Subscription } from "@shared/schema";
import { storage } from "./storage";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LIFETIME_THRESHOLD_YEARS = 50;
const DEFAULT_SIGNUP_TRIAL_DAYS = 14;

export type SubscriptionAccessState = "inactive" | "trial" | "active" | "lifetime";

function parsePositiveInteger(value: string): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function getSignupTrialDays(): number {
  return (
    parsePositiveInteger(process.env.SIGNUP_TRIAL_DAYS || "") ??
    parsePositiveInteger(process.env.DEFAULT_TRIAL_DAYS || "") ??
    DEFAULT_SIGNUP_TRIAL_DAYS
  );
}

export function getTrialPeriodEnd(from = new Date(), trialDays = getSignupTrialDays()): Date | null {
  if (trialDays <= 0) return null;
  return new Date(from.getTime() + trialDays * MS_PER_DAY);
}

export function getSubscriptionEndDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isLifetimeSubscription(
  subscription: Pick<Subscription, "currentPeriodEnd"> | null | undefined,
): boolean {
  const endDate = getSubscriptionEndDate(subscription?.currentPeriodEnd);
  if (!endDate) return false;
  const threshold = new Date();
  threshold.setFullYear(threshold.getFullYear() + LIFETIME_THRESHOLD_YEARS);
  return endDate > threshold;
}

export function isExpiredSubscription(
  subscription: Pick<Subscription, "status" | "currentPeriodEnd"> | null | undefined,
): boolean {
  if (!subscription || subscription.status !== "active") return false;
  if (isLifetimeSubscription(subscription as Pick<Subscription, "currentPeriodEnd">)) return false;
  const endDate = getSubscriptionEndDate(subscription.currentPeriodEnd);
  return !!endDate && endDate.getTime() <= Date.now();
}

function looksLikeTrialSubscription(subscription: Subscription): boolean {
  if (subscription.status !== "active") return false;
  if (subscription.stripeSubscriptionId) return false;

  const endDate = getSubscriptionEndDate(subscription.currentPeriodEnd);
  const createdAt = getSubscriptionEndDate(subscription.createdAt);
  if (!endDate || !createdAt) return false;
  if (isLifetimeSubscription(subscription)) return false;
  if (endDate.getTime() <= Date.now()) return false;

  const trialDays = getSignupTrialDays();
  if (trialDays <= 0) return false;

  const expectedEnd = createdAt.getTime() + trialDays * MS_PER_DAY;
  return Math.abs(endDate.getTime() - expectedEnd) <= MS_PER_DAY;
}

export function getSubscriptionAccessState(subscription: Subscription | undefined): SubscriptionAccessState {
  if (!subscription || subscription.status !== "active") return "inactive";
  if (isExpiredSubscription(subscription)) return "inactive";
  if (isLifetimeSubscription(subscription)) return "lifetime";
  if (looksLikeTrialSubscription(subscription)) return "trial";
  return "active";
}

export function hasSubscriptionAccess(subscription: Subscription | undefined): boolean {
  return getSubscriptionAccessState(subscription) !== "inactive";
}

export async function normalizeExpiredSubscriptionStatus(
  userId: string,
  subscription: Subscription | undefined,
): Promise<Subscription | undefined> {
  if (!subscription || !isExpiredSubscription(subscription)) {
    return subscription;
  }

  return storage.updateSubscription(userId, { status: "inactive" });
}
