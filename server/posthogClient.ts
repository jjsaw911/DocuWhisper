import { PostHog } from "posthog-node";

const key = process.env.VITE_POSTHOG_KEY;
const host = process.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";

export const posthog = key
  ? new PostHog(key, {
      host,
      flushAt: 1,
      flushInterval: 1000,
    })
  : null;

export const captureSignupCompleted = (
  userId: string,
  properties?: Record<string, unknown>,
): void => {
  try {
    posthog?.capture({
      distinctId: userId,
      event: "user_signup_completed",
      properties: properties ?? {},
    });
  } catch (err) {
    console.error("[posthog] capture failed:", err);
  }
};
