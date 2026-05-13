type UserLike = {
  email?: string | null;
};

export type SoapDebugInfo = {
  model: string;
  selectedModel: string;
  cleanupModel: string;
  usedLongSummary: boolean;
  fallbackReason: string | null;
  attemptTrace: string | null;
  recordedAt: string;
};

export type SoapDebugFailure = {
  reason: string;
  trace: string | null;
};

const SOAP_DEBUG_EMAIL = "joseph.sawyer@outlook.com";
const STORAGE_PREFIX = "docuwhisper:soap-debug:";
const BETA_HOSTS = new Set(["beta.docuwhisper.com", "localhost", "127.0.0.1"]);

export function canViewBetaSoapDebug(user: UserLike | null | undefined): boolean {
  if (typeof window === "undefined") return false;
  const email = user?.email?.trim().toLowerCase() || "";
  if (email !== SOAP_DEBUG_EMAIL) return false;
  return BETA_HOSTS.has(window.location.hostname);
}

export function readSoapDebugInfoFromResponse(response: Response): SoapDebugInfo | null {
  const model = response.headers.get("X-DocuWhisper-SOAP-Model")?.trim() || "";
  const selectedModel = response.headers.get("X-DocuWhisper-SOAP-Selected-Model")?.trim() || "";
  if (!model || !selectedModel) return null;

  return {
    model,
    selectedModel,
    cleanupModel:
      response.headers.get("X-DocuWhisper-SOAP-Cleanup-Model")?.trim() || "none",
    usedLongSummary:
      response.headers.get("X-DocuWhisper-SOAP-Used-Long-Summary") === "1",
    fallbackReason:
      response.headers.get("X-DocuWhisper-SOAP-Fallback-Reason")?.trim() || null,
    attemptTrace:
      response.headers.get("X-DocuWhisper-SOAP-Attempt-Trace")?.trim() || null,
    recordedAt: new Date().toISOString(),
  };
}

export function saveSoapDebugInfo(noteId: number, info: SoapDebugInfo | null) {
  if (typeof window === "undefined" || !Number.isFinite(noteId) || !info) return;
  window.sessionStorage.setItem(`${STORAGE_PREFIX}${noteId}`, JSON.stringify(info));
}

export function loadSoapDebugInfo(noteId: number): SoapDebugInfo | null {
  if (typeof window === "undefined" || !Number.isFinite(noteId)) return null;
  const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${noteId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SoapDebugInfo;
  } catch {
    return null;
  }
}

export function formatSoapDebugLabel(info: SoapDebugInfo): string {
  const parts = [`Model: ${info.model}`];
  if (info.model !== info.selectedModel) {
    parts.push(`selected: ${info.selectedModel}`);
  }
  parts.push(`compression: ${info.cleanupModel}`);
  if (info.usedLongSummary) {
    parts.push("long-summary: yes");
  }
  return parts.join(" · ");
}

export function formatSoapDebugSecondary(info: SoapDebugInfo): string | null {
  return info.fallbackReason || info.attemptTrace || null;
}

export function readSoapDebugFailureFromError(error: unknown): SoapDebugFailure | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/^\d+:\s*(\{[\s\S]*\})$/);
  if (!match) return null;

  try {
    const payload = JSON.parse(match[1]) as {
      error?: string;
      debugReason?: string;
      debugTrace?: string;
    };
    if (!payload.debugReason && !payload.debugTrace) {
      return null;
    }
    return {
      reason: payload.debugReason || payload.error || "Failed to generate SOAP note",
      trace: payload.debugTrace || null,
    };
  } catch {
    return null;
  }
}
