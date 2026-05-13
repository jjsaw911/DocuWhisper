type Props = Record<string, unknown>;

interface PostHog {
  capture: (event: string, properties?: Props) => void;
  identify: (distinctId: string, properties?: Props) => void;
  reset: () => void;
  register: (properties: Props) => void;
}

declare global {
  interface Window {
    posthog?: PostHog;
  }
}

export function capture(event: string, properties?: Props): void {
  try {
    window.posthog?.capture(event, properties);
  } catch {}
}

export function identify(distinctId: string, properties?: Props): void {
  try {
    window.posthog?.identify(distinctId, properties);
  } catch {}
}

export function reset(): void {
  try {
    window.posthog?.reset();
  } catch {}
}
