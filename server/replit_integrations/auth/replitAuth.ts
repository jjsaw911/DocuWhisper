import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import express from "express";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler, Request } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { timingSafeEqual } from "crypto";
import { authStorage } from "./storage";
import { storage } from "../../storage";

// Security event logging helper
const logSecurityEvent = async (
  req: Request,
  action: string,
  userId?: string,
  userEmail?: string,
  details?: object
) => {
  try {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    await storage.createAuditLog({
      userId: userId || 'anonymous',
      userEmail,
      action,
      resourceType: 'session',
      details: details ? JSON.stringify(details) : undefined,
      ipAddress: typeof ipAddress === 'string' ? ipAddress : ipAddress?.[0],
      userAgent,
    });
  } catch (error) {
    console.error("Failed to log security event:", error);
  }
};

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

function readEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type LocalAuthConfig = {
  enabled: boolean;
  username: string;
  password: string;
  userId: string;
  userEmail: string;
  firstName: string;
  lastName: string;
  title: string;
  subtitle: string;
};

function getLocalAuthConfig(): LocalAuthConfig {
  const username = readEnv("LOCAL_AUTH_USERNAME", "WEB_TEST_USERNAME");
  const password = readEnv("LOCAL_AUTH_PASSWORD", "WEB_TEST_PASSWORD");
  const hasCredentials = !!username && !!password;
  const explicitFlag = parseBooleanEnv(process.env.LOCAL_AUTH_ENABLED);
  const hasReplitOidcConfig = !!readEnv("REPL_ID");

  const enabled =
    hasCredentials &&
    (explicitFlag === true || (explicitFlag === undefined && !hasReplitOidcConfig));

  return {
    enabled,
    username,
    password,
    userId: readEnv("LOCAL_AUTH_USER_ID") || "local-user",
    userEmail: readEnv("LOCAL_AUTH_USER_EMAIL") || "local-user@docuwhisper.local",
    firstName: readEnv("LOCAL_AUTH_FIRST_NAME") || "Local",
    lastName: readEnv("LOCAL_AUTH_LAST_NAME") || "User",
    title: readEnv("LOCAL_AUTH_LOGIN_TITLE") || "DocuWhisper Sign In",
    subtitle: readEnv("LOCAL_AUTH_LOGIN_SUBTITLE") || "Use the tester credentials provided by your administrator.",
  };
}

function renderLocalLoginPage(params: { title: string; subtitle: string; error?: string }): string {
  const escapedTitle = escapeHtml(params.title);
  const escapedSubtitle = escapeHtml(params.subtitle);
  const message =
    params.error === "invalid_credentials"
      ? "Invalid username or password."
      : params.error === "login_failed"
        ? "Sign in failed. Please try again."
        : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f7fa; color: #0b1320; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { width: 100%; max-width: 420px; background: #ffffff; border: 1px solid #dce3ea; border-radius: 14px; padding: 22px; box-shadow: 0 12px 30px rgba(17,24,39,0.08); }
    h1 { margin: 0 0 8px; font-size: 1.35rem; }
    p { margin: 0 0 14px; color: #5b6674; font-size: 0.95rem; }
    label { display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem; }
    input { width: 100%; box-sizing: border-box; border: 1px solid #c8d2dc; border-radius: 10px; padding: 11px; font-size: 0.95rem; margin-bottom: 12px; }
    button { width: 100%; border: 0; border-radius: 10px; padding: 11px; font-size: 0.95rem; font-weight: 700; background: #0d9488; color: #ffffff; cursor: pointer; }
    .error { margin: 0 0 10px; color: #b91c1c; font-size: 0.9rem; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrap">
    <main class="card">
      <h1>${escapedTitle}</h1>
      <p>${escapedSubtitle}</p>
      ${message ? `<div class="error">${escapeHtml(message)}</div>` : ""}
      <form method="post" action="/api/login">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" autocomplete="username" required />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <button type="submit">Sign In</button>
      </form>
    </main>
  </div>
</body>
</html>`;
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: any) {
  await authStorage.upsertUser({
    id: claims["sub"],
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  const localAuthConfig = getLocalAuthConfig();
  if (localAuthConfig.enabled) {
    app.get("/api/login", (req, res) => {
      if (req.isAuthenticated?.()) {
        const returnTo = typeof (req as any).session?.returnTo === "string" ? (req as any).session.returnTo : "/";
        return res.redirect(returnTo);
      }
      const error = typeof req.query.error === "string" ? req.query.error : undefined;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(
        renderLocalLoginPage({
          title: localAuthConfig.title,
          subtitle: localAuthConfig.subtitle,
          error,
        })
      );
    });

    app.post("/api/login", express.urlencoded({ extended: false }), async (req, res) => {
      const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";

      const usernameValid = username.length > 0 && constantTimeEquals(username, localAuthConfig.username);
      const passwordValid = password.length > 0 && constantTimeEquals(password, localAuthConfig.password);
      if (!usernameValid || !passwordValid) {
        return res.redirect("/api/login?error=invalid_credentials");
      }

      const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

      try {
        await authStorage.upsertUser({
          id: localAuthConfig.userId,
          email: localAuthConfig.userEmail,
          firstName: localAuthConfig.firstName,
          lastName: localAuthConfig.lastName,
          profileImageUrl: null,
        });

        const userSession = {
          claims: {
            sub: localAuthConfig.userId,
            email: localAuthConfig.userEmail,
            first_name: localAuthConfig.firstName,
            last_name: localAuthConfig.lastName,
            exp: expiresAt,
          },
          access_token: "local_auth",
          refresh_token: undefined,
          expires_at: expiresAt,
        };

        await new Promise<void>((resolve, reject) => {
          (req as any).login(userSession, (error: unknown) => {
            if (error) return reject(error);
            resolve();
          });
        });

        const session = (req as any).session as any | undefined;
        const returnTo = typeof session?.returnTo === "string" ? session.returnTo : "/";
        if (session && "returnTo" in session) {
          delete session.returnTo;
        }

        const finish = () => {
          void logSecurityEvent(req, "login", localAuthConfig.userId, localAuthConfig.userEmail, {
            method: "local_password",
          });
          res.redirect(returnTo);
        };

        if (session && typeof session.save === "function") {
          return session.save(finish);
        }

        return finish();
      } catch (error) {
        console.error("[local-auth] Login failed:", error);
        return res.redirect("/api/login?error=login_failed");
      }
    });

    app.get("/api/callback", (_req, res) => {
      res.redirect("/api/login");
    });

    app.get("/api/logout", (req, res) => {
      const user = req.user as any;
      const userId = user?.claims?.sub;
      const userEmail = user?.claims?.email;

      if (userId) {
        void logSecurityEvent(req, "logout", userId, userEmail);
      }

      req.logout(() => {
        res.redirect("/");
      });
    });

    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  // Keep track of registered strategies
  const registeredStrategies = new Set<string>();

  // Helper function to ensure strategy exists for a domain
  const ensureStrategy = (domain: string) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, (err?: any) => {
      if (err) return next(err);
      // Log successful login
      const user = req.user as any;
      if (user?.claims) {
        logSecurityEvent(req, 'login', user.claims.sub, user.claims.email, {
          method: 'oauth'
        });
      }
      next();
    });
  });

  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    const userId = user?.claims?.sub;
    const userEmail = user?.claims?.email;
    
    // Log logout event before session destruction
    if (userId) {
      logSecurityEvent(req, 'logout', userId, userEmail);
    }
    
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
