import { storage } from "./storage";

const MAILBOX_DIRECTORY_RESOURCE_TYPE = "mailbox_directory_preference";
const CACHE_TTL_MS = 60_000;

interface MailboxDirectoryState {
  visibilityByUserId: Map<string, boolean>;
  updatedAtByUserId: Map<string, string>;
  loadedAt: number;
}

let cachedState: MailboxDirectoryState | null = null;

const parseListInDirectory = (details: string | null): boolean | null => {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as { listInDirectory?: unknown };
    if (typeof parsed.listInDirectory === "boolean") {
      return parsed.listInDirectory;
    }
    return null;
  } catch {
    return null;
  }
};

const loadDirectoryState = async (): Promise<MailboxDirectoryState> => {
  const now = Date.now();
  if (cachedState && now - cachedState.loadedAt < CACHE_TTL_MS) {
    return cachedState;
  }

  const logs = await storage.getAuditLogs({ resourceType: MAILBOX_DIRECTORY_RESOURCE_TYPE });
  const visibilityByUserId = new Map<string, boolean>();
  const updatedAtByUserId = new Map<string, string>();

  for (const log of logs) {
    if (!log.userId || visibilityByUserId.has(log.userId)) continue;
    const parsedValue = parseListInDirectory(log.details);
    if (parsedValue === null) continue;
    visibilityByUserId.set(log.userId, parsedValue);
    if (log.timestamp) {
      updatedAtByUserId.set(log.userId, new Date(log.timestamp).toISOString());
    }
  }

  const state: MailboxDirectoryState = {
    visibilityByUserId,
    updatedAtByUserId,
    loadedAt: now,
  };

  cachedState = state;
  return state;
};

export const getMailboxDirectoryVisibilityMap = async () => {
  const state = await loadDirectoryState();
  return state.visibilityByUserId;
};

export const getMailboxDirectoryPreference = async (userId: string) => {
  const state = await loadDirectoryState();
  return {
    listInDirectory: state.visibilityByUserId.get(userId) ?? true,
    updatedAt: state.updatedAtByUserId.get(userId) || null,
  };
};

export const updateMailboxDirectoryPreference = async (params: {
  userId: string;
  userEmail?: string;
  listInDirectory: boolean;
  ipAddress?: string;
  userAgent?: string;
}) => {
  const listInDirectory = params.listInDirectory !== false;

  await storage.createAuditLog({
    userId: params.userId,
    userEmail: params.userEmail || null,
    action: "updated",
    resourceType: MAILBOX_DIRECTORY_RESOURCE_TYPE,
    details: JSON.stringify({ listInDirectory }),
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  });

  const nowIso = new Date().toISOString();
  if (cachedState) {
    cachedState.visibilityByUserId.set(params.userId, listInDirectory);
    cachedState.updatedAtByUserId.set(params.userId, nowIso);
    cachedState.loadedAt = Date.now();
  } else {
    cachedState = {
      visibilityByUserId: new Map([[params.userId, listInDirectory]]),
      updatedAtByUserId: new Map([[params.userId, nowIso]]),
      loadedAt: Date.now(),
    };
  }

  return {
    listInDirectory,
    updatedAt: nowIso,
  };
};
