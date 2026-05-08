type ParsedPaymentError = {
  message: string;
};

function parseErrorPayload(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof Error)) return null;
  const separatorIndex = error.message.indexOf(":");
  if (separatorIndex < 0) return null;

  const rawPayload = error.message.slice(separatorIndex + 1).trim();
  if (!rawPayload.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(rawPayload);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function getNoteCreditError(error: unknown): ParsedPaymentError | null {
  const payload = parseErrorPayload(error);
  if (!payload) return null;

  const code = typeof payload.code === "string" ? payload.code : "";
  const errorType = typeof payload.error === "string" ? payload.error : "";
  if (code !== "note_credits_exhausted" && errorType !== "payment_required") {
    return null;
  }

  const message =
    typeof payload.message === "string" && payload.message.trim().length > 0
      ? payload.message.trim()
      : "You have no note credits remaining for this billing cycle.";

  return { message };
}
