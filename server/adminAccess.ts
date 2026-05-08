import { storage } from "./storage";
import { isOwnerEmail } from "./subscriptionPlans";

const ADMIN_ACCESS_CACHE_KEY = "__docuwhisperAdminAccess";

export type AdminAccessContext = {
  userId: string | null;
  userEmail: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

type AdminAccessRequest = {
  user?: {
    claims?: {
      sub?: string;
      email?: string;
    };
  };
  [ADMIN_ACCESS_CACHE_KEY]?: AdminAccessContext;
};

export async function resolveAdminAccess(params: {
  userId?: string | null;
  userEmail?: string | null;
}): Promise<AdminAccessContext> {
  const userId = typeof params.userId === "string" && params.userId.trim().length > 0 ? params.userId : null;
  const userEmail =
    typeof params.userEmail === "string" && params.userEmail.trim().length > 0
      ? params.userEmail.trim().toLowerCase()
      : null;
  const isSuperAdmin = isOwnerEmail(userEmail);

  if (isSuperAdmin) {
    return {
      userId,
      userEmail,
      isAdmin: true,
      isSuperAdmin: true,
    };
  }

  if (!userId) {
    return {
      userId,
      userEmail,
      isAdmin: false,
      isSuperAdmin: false,
    };
  }

  const user = await storage.getUserById(userId);
  return {
    userId,
    userEmail,
    isAdmin: user?.isAdmin === true,
    isSuperAdmin: false,
  };
}

export async function getAdminAccessContext(req: AdminAccessRequest): Promise<AdminAccessContext> {
  if (req[ADMIN_ACCESS_CACHE_KEY]) {
    return req[ADMIN_ACCESS_CACHE_KEY]!;
  }

  const access = await resolveAdminAccess({
    userId: req.user?.claims?.sub ?? null,
    userEmail: req.user?.claims?.email ?? null,
  });

  req[ADMIN_ACCESS_CACHE_KEY] = access;
  return access;
}
