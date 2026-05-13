import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import express from "express";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler, Request } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { createVerify, timingSafeEqual } from "crypto";
import { authStorage } from "./storage";
import { storage } from "../../storage";
import { resolveAdminAccess } from "../../adminAccess";
import { captureSignupCompleted } from "../../posthogClient";
import {
  getTrialPeriodEnd,
  hasSubscriptionAccess,
  normalizeExpiredSubscriptionStatus,
} from "../../subscriptionAccess";

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

function readEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

const DEFAULT_MOBILE_AUTH_REDIRECT_ALLOWLIST = [
  "docuwhisper://auth/callback",
  "docuwhisper://auth/logout",
];

function getAllowedMobileRedirectUris(): string[] {
  const raw = readEnv("MOBILE_AUTH_REDIRECT_ALLOWLIST");
  const configured = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set([...configured, ...DEFAULT_MOBILE_AUTH_REDIRECT_ALLOWLIST]));
}

function getSafeLogoutRedirectUri(req: Request): string {
  const redirectUri =
    typeof req.query.redirect_uri === "string" ? req.query.redirect_uri.trim() : "";

  if (!redirectUri) {
    return "/";
  }

  if (getAllowedMobileRedirectUris().some((allowed) => redirectUri.startsWith(allowed))) {
    return redirectUri;
  }

  return "/";
}

type IdentityPlatformConfig = {
  enabled: boolean;
  hasAnyConfig: boolean;
  apiKey: string;
  authDomain: string;
  appId: string;
  projectId: string;
  tenantId: string;
  appBaseUrl: string;
};

type IdentityPlatformClaims = {
  aud: string;
  email?: string;
  email_verified?: boolean;
  exp: number;
  firebase?: {
    sign_in_provider?: string;
    tenant?: string;
  };
  iat: number;
  iss: string;
  name?: string;
  picture?: string;
  sub: string;
};

type FirebaseCertCache = {
  certs: Record<string, string>;
  expiresAt: number;
};

const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SUBSCRIPTION_BYPASS_PATHS = new Set([
  "/api/auth/user",
  "/api/auth/profile-image",
  "/api/subscription",
  "/api/stripe/checkout",
  "/api/stripe/portal",
  "/api/stripe/price",
  "/api/stripe/prices",
  "/api/invites/redeem",
  "/api/admin/check",
]);
let firebaseCertCache: FirebaseCertCache | null = null;

function shouldBypassSubscriptionGate(pathname: string): boolean {
  return SUBSCRIPTION_BYPASS_PATHS.has(pathname);
}

function getIdentityPlatformConfig(): IdentityPlatformConfig {
  const apiKey = readEnv("IDENTITY_API_KEY");
  const authDomain = readEnv("IDENTITY_AUTH_DOMAIN");
  const appId = readEnv("IDENTITY_APP_ID");
  const projectId = readEnv("IDENTITY_PROJECT_ID", "PROJECT_ID");
  const tenantId = readEnv("IDENTITY_TENANT_ID");
  const appBaseUrl = readEnv("APP_BASE_URL");

  const values = [apiKey, authDomain, appId, projectId];
  const hasAnyConfig = values.some(Boolean);
  const enabled = values.every(Boolean);

  return {
    enabled,
    hasAnyConfig,
    apiKey,
    authDomain,
    appId,
    projectId,
    tenantId,
    appBaseUrl,
  };
}

function ensureIdentityPlatformConfig(config: IdentityPlatformConfig): IdentityPlatformConfig {
  if (config.enabled) return config;
  if (!config.hasAnyConfig) return config;

  throw new Error(
    "Identity Platform configuration is incomplete. Set IDENTITY_API_KEY, IDENTITY_AUTH_DOMAIN, IDENTITY_APP_ID, and IDENTITY_PROJECT_ID (or PROJECT_ID)."
  );
}

function parseCacheMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) return 3600;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match) return 3600;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3600;
}

async function getFirebaseSigningCertificates(): Promise<Record<string, string>> {
  if (firebaseCertCache && firebaseCertCache.expiresAt > Date.now()) {
    return firebaseCertCache.certs;
  }

  const response = await fetch(FIREBASE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Firebase signing certificates (${response.status})`);
  }

  const certs = (await response.json()) as Record<string, string>;
  firebaseCertCache = {
    certs,
    expiresAt: Date.now() + parseCacheMaxAgeSeconds(response.headers.get("cache-control")) * 1000,
  };

  return certs;
}

function decodeJwtSegment(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = Buffer.from(padded, "base64").toString("utf8");
  return JSON.parse(decoded) as Record<string, unknown>;
}

function decodeJwtPayload<T>(segment: string): T {
  return decodeJwtSegment(segment) as T;
}

async function verifyIdentityPlatformIdToken(
  idToken: string,
  config: IdentityPlatformConfig
): Promise<IdentityPlatformClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid identity token");
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeJwtSegment(headerSegment);
  const payload = decodeJwtPayload<IdentityPlatformClaims>(payloadSegment);

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("Unsupported identity token signature");
  }

  const certificates = await getFirebaseSigningCertificates();
  const certificate = certificates[header.kid];
  if (!certificate) {
    throw new Error("Signing certificate not found for identity token");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${headerSegment}.${payloadSegment}`);
  verifier.end();

  const normalizedSignature = signatureSegment.replace(/-/g, "+").replace(/_/g, "/");
  const paddedSignature = normalizedSignature.padEnd(
    Math.ceil(normalizedSignature.length / 4) * 4,
    "="
  );
  const signature = Buffer.from(paddedSignature, "base64");

  if (!verifier.verify(certificate, signature)) {
    throw new Error("Identity token signature verification failed");
  }

  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${config.projectId}`;
  if (payload.aud !== config.projectId || payload.iss !== expectedIssuer) {
    throw new Error("Identity token issuer mismatch");
  }

  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Identity token subject missing");
  }

  if (typeof payload.exp !== "number" || payload.exp <= now - 300) {
    throw new Error("Identity token has expired");
  }

  if (typeof payload.iat !== "number" || payload.iat > now + 300) {
    throw new Error("Identity token issued-at timestamp is invalid");
  }

  if (config.tenantId && payload.firebase?.tenant !== config.tenantId) {
    throw new Error("Identity token tenant mismatch");
  }

  return payload;
}

function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function getSessionSecret(): string {
  const sessionSecret = readEnv("SESSION_SECRET");
  if (sessionSecret) return sessionSecret;

  if (process.env.NODE_ENV !== "production") {
    return "docuwhisper-dev-session-secret";
  }

  throw new Error(
    "SESSION_SECRET is required in production. Set SESSION_SECRET in your environment."
  );
}

function getReplitClientId(): string {
  const clientId = readEnv("REPL_ID");
  if (clientId) return clientId;

  throw new Error(
    "Auth configuration missing. Set REPL_ID for Replit OIDC, or configure LOCAL_AUTH_USERNAME/LOCAL_AUTH_PASSWORD (or MOBILE_TEST_USERNAME/MOBILE_TEST_PASSWORD) for non-Replit deployments."
  );
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(readEnv("ISSUER_URL") || "https://replit.com/oidc"),
      getReplitClientId()
    );
  },
  { maxAge: 3600 * 1000 }
);

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
  const username = readEnv(
    "LOCAL_AUTH_USERNAME",
    "WEB_TEST_USERNAME",
    "MOBILE_TEST_USERNAME",
    "MOBILE_REVIEW_USERNAME",
    "APP_REVIEW_USERNAME"
  );
  const password = readEnv(
    "LOCAL_AUTH_PASSWORD",
    "WEB_TEST_PASSWORD",
    "MOBILE_TEST_PASSWORD",
    "MOBILE_REVIEW_PASSWORD",
    "APP_REVIEW_PASSWORD"
  );
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
    userId:
      readEnv(
        "LOCAL_AUTH_USER_ID",
        "MOBILE_TEST_USER_ID",
        "MOBILE_REVIEW_USER_ID",
        "APP_REVIEW_USER_ID"
      ) || "local-user",
    userEmail:
      readEnv(
        "LOCAL_AUTH_USER_EMAIL",
        "MOBILE_TEST_USER_EMAIL",
        "MOBILE_REVIEW_USER_EMAIL",
        "APP_REVIEW_USER_EMAIL"
      ) || "local-user@docuwhisper.local",
    firstName:
      readEnv(
        "LOCAL_AUTH_FIRST_NAME",
        "MOBILE_TEST_FIRST_NAME",
        "MOBILE_REVIEW_FIRST_NAME",
        "APP_REVIEW_FIRST_NAME"
      ) || "Local",
    lastName:
      readEnv(
        "LOCAL_AUTH_LAST_NAME",
        "MOBILE_TEST_LAST_NAME",
        "MOBILE_REVIEW_LAST_NAME",
        "APP_REVIEW_LAST_NAME"
      ) || "User",
    title:
      readEnv(
        "LOCAL_AUTH_LOGIN_TITLE",
        "MOBILE_TEST_LOGIN_TITLE",
        "MOBILE_REVIEW_LOGIN_TITLE"
      ) || "DocuWhisper Sign In",
    subtitle:
      readEnv(
        "LOCAL_AUTH_LOGIN_SUBTITLE",
        "MOBILE_TEST_LOGIN_SUBTITLE",
        "MOBILE_REVIEW_LOGIN_SUBTITLE"
      ) || "Use the tester credentials provided by your administrator.",
  };
}

function renderLocalLoginPage(params: {
  title: string;
  subtitle: string;
  error?: string;
  formAction?: string;
}): string {
  const escapedTitle = escapeHtml(params.title);
  const escapedSubtitle = escapeHtml(params.subtitle);
  const escapedFormAction = escapeHtml(params.formAction || "/api/login");
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
      <form method="post" action="${escapedFormAction}">
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

function renderIdentityPlatformLoginPage(params: {
  config: IdentityPlatformConfig;
  appBaseUrl: string;
  initialMode: "login" | "signup";
  message?: string;
  showLocalFallback: boolean;
}): string {
  const configJson = jsonForInlineScript({
    apiKey: params.config.apiKey,
    authDomain: params.config.authDomain,
    appId: params.config.appId,
    projectId: params.config.projectId,
    tenantId: params.config.tenantId || null,
    appBaseUrl: params.appBaseUrl,
    localFallbackUrl: params.showLocalFallback ? "/api/login/local" : null,
  });
  const initialMode = jsonForInlineScript(params.initialMode);
  const initialMessage = jsonForInlineScript(params.message || "");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DocuWhisper Sign In</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f7fb;
      --panel: #ffffff;
      --panel-alt: #eef5f4;
      --text: #0f172a;
      --muted: #5b6674;
      --line: #d7e1e7;
      --accent: #0f766e;
      --accent-dark: #115e59;
      --danger: #b91c1c;
      --danger-bg: #fef2f2;
      --info-bg: #eff6ff;
      --info: #1d4ed8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top right, rgba(15,118,110,0.08), transparent 28%),
        linear-gradient(180deg, #f8fbff 0%, var(--bg) 100%);
      color: var(--text);
    }
    .shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 960px;
      display: grid;
      grid-template-columns: 1.1fr 1fr;
      background: var(--panel);
      border: 1px solid rgba(215,225,231,0.9);
      border-radius: 24px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
      overflow: hidden;
    }
    .hero {
      background: linear-gradient(165deg, #0f766e 0%, #134e4a 100%);
      color: #f8fafc;
      padding: 40px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 24px;
    }
    .hero h1 {
      margin: 0 0 12px;
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1.02;
      letter-spacing: -0.03em;
    }
    .hero p {
      margin: 0;
      color: rgba(248,250,252,0.82);
      line-height: 1.6;
      max-width: 28rem;
    }
    .hero ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 10px;
    }
    .hero li {
      display: flex;
      align-items: center;
      gap: 10px;
      color: rgba(248,250,252,0.92);
    }
    .hero li::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #99f6e4;
      flex: none;
    }
    .panel {
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .eyebrow {
      margin: 0;
      font-size: 0.82rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
    }
    .title {
      margin: 0;
      font-size: 1.75rem;
      letter-spacing: -0.03em;
    }
    .subtitle {
      margin: 0;
      color: var(--muted);
      line-height: 1.55;
    }
    .tabs {
      display: inline-grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      padding: 6px;
      background: var(--panel-alt);
      border-radius: 999px;
      width: 100%;
      max-width: 340px;
    }
    .tab {
      border: 0;
      border-radius: 999px;
      padding: 10px 14px;
      background: transparent;
      color: var(--muted);
      font-weight: 700;
      cursor: pointer;
    }
    .tab.active {
      background: var(--panel);
      color: var(--text);
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
    }
    .alert {
      display: none;
      border-radius: 14px;
      padding: 12px 14px;
      line-height: 1.5;
      font-size: 0.95rem;
    }
    .alert.visible { display: block; }
    .alert.info { background: var(--info-bg); color: var(--info); }
    .alert.error { background: var(--danger-bg); color: var(--danger); }
    .form {
      display: none;
      gap: 14px;
    }
    .form.active {
      display: grid;
    }
    .row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .field {
      display: grid;
      gap: 7px;
    }
    label {
      font-size: 0.93rem;
      font-weight: 700;
    }
    input {
      width: 100%;
      padding: 12px 13px;
      border-radius: 12px;
      border: 1px solid var(--line);
      font-size: 0.98rem;
      color: var(--text);
      background: #fff;
    }
    input:focus {
      outline: 2px solid rgba(15,118,110,0.18);
      border-color: var(--accent);
    }
    button.primary, button.secondary {
      border: 0;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 0.97rem;
      font-weight: 700;
      cursor: pointer;
    }
    button.primary {
      background: var(--accent);
      color: #fff;
    }
    button.primary:hover { background: var(--accent-dark); }
    button.secondary {
      background: transparent;
      color: var(--accent);
      padding: 0;
      text-align: left;
    }
    button.google {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      background: #ffffff;
      color: #1f2937;
      border: 1px solid #d7e1e7;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 0.97rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    button.google:hover { background: #f8fafc; border-color: #bfd0db; }
    button.google[disabled] { opacity: 0.6; cursor: not-allowed; }
    button.google svg { width: 18px; height: 18px; flex-shrink: 0; }
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--muted);
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 4px 0;
    }
    .divider::before, .divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--line);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
    }
    .small {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .mfa-box {
      display: none;
      gap: 12px;
      padding: 16px;
      border-radius: 16px;
      background: var(--panel-alt);
      border: 1px solid var(--line);
    }
    .mfa-box.visible { display: grid; }
    .hidden { display: none !important; }
    .footer-link {
      margin-top: auto;
      color: var(--muted);
      font-size: 0.85rem;
    }
    .footer-link a {
      color: var(--accent);
      text-decoration: none;
    }
    @media (max-width: 900px) {
      .card { grid-template-columns: 1fr; }
      .hero { padding: 28px; }
    }
    @media (max-width: 640px) {
      .panel { padding: 24px; }
      .row { grid-template-columns: 1fr; }
      .actions { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <main class="card">
      <section class="hero">
        <div>
          <h1>Clinical documentation without a shared login.</h1>
          <p>Each clinician and staff member signs in with a unique account. New signups automatically create their own practice workspace on first verified login.</p>
        </div>
        <ul>
          <li>Email/password sign-in through Google Identity Platform</li>
          <li>Automatic practice bootstrap for new accounts</li>
          <li>MFA-capable sign-in flow for TOTP-enrolled users</li>
        </ul>
      </section>
      <section class="panel">
        <p class="eyebrow">DocuWhisper Access</p>
        <h2 class="title">Sign in or create your account</h2>
        <p class="subtitle">Use your own user account. Shared production logins are not supported.</p>

        <button class="google" type="button" id="google-signin" data-testid="button-google-signin">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>Continue with Google</span>
        </button>
        <div class="divider">or with email</div>

        <div class="tabs" role="tablist" aria-label="Authentication mode">
          <button class="tab" id="tab-login" type="button">Sign In</button>
          <button class="tab" id="tab-signup" type="button">Create Account</button>
        </div>
        <div id="alert" class="alert" aria-live="polite"></div>

        <form id="login-form" class="form" novalidate>
          <div class="field">
            <label for="login-email">Email</label>
            <input id="login-email" name="email" type="email" autocomplete="username" required />
          </div>
          <div class="field">
            <label for="login-password">Password</label>
            <input id="login-password" name="password" type="password" autocomplete="current-password" required />
          </div>
          <div id="mfa-box" class="mfa-box">
            <p class="small" id="mfa-copy">Enter the 6-digit code from your authenticator app.</p>
            <div class="field">
              <label for="mfa-code">Authenticator Code</label>
              <input id="mfa-code" name="mfaCode" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" />
            </div>
            <button class="primary" type="button" id="mfa-submit">Verify Code</button>
          </div>
          <button class="primary" type="submit" id="login-submit">Sign In</button>
          <div class="actions">
            <button class="secondary" type="button" id="forgot-password">Send password reset email</button>
            <button class="secondary hidden" type="button" id="resend-verification">Resend verification email</button>
          </div>
        </form>

        <form id="signup-form" class="form" novalidate>
          <div class="row">
            <div class="field">
              <label for="signup-first-name">First Name</label>
              <input id="signup-first-name" name="firstName" type="text" autocomplete="given-name" required />
            </div>
            <div class="field">
              <label for="signup-last-name">Last Name</label>
              <input id="signup-last-name" name="lastName" type="text" autocomplete="family-name" required />
            </div>
          </div>
          <div class="field">
            <label for="signup-practice-name">Practice Name</label>
            <input id="signup-practice-name" name="practiceName" type="text" autocomplete="organization" required />
          </div>
          <div class="field">
            <label for="signup-email">Work Email</label>
            <input id="signup-email" name="email" type="email" autocomplete="email" required />
          </div>
          <div class="row">
            <div class="field">
              <label for="signup-password">Password</label>
              <input id="signup-password" name="password" type="password" autocomplete="new-password" required />
            </div>
            <div class="field">
              <label for="signup-confirm-password">Confirm Password</label>
              <input id="signup-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required />
            </div>
          </div>
          <p class="small">After signup, we send an email verification link. Once verified, your first login creates your practice automatically.</p>
          <button class="primary" type="submit" id="signup-submit">Create Account</button>
        </form>

        <p class="footer-link${params.showLocalFallback ? "" : " hidden"}">Emergency admin access is available at <a href="/api/login/local">/api/login/local</a>.</p>
      </section>
    </main>
  </div>
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
    import {
      GoogleAuthProvider,
      TotpMultiFactorGenerator,
      createUserWithEmailAndPassword,
      getMultiFactorResolver,
      initializeAuth,
      inMemoryPersistence,
      sendEmailVerification,
      sendPasswordResetEmail,
      signInWithEmailAndPassword,
      signInWithPopup,
      signOut,
      updateProfile,
    } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

    const config = ${configJson};
    const initialMode = ${initialMode};
    const initialMessage = ${initialMessage};
    const verificationUrl = config.appBaseUrl.replace(/\\/+$/, "") + "/api/login?mode=login&verified=1";
    const app = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      appId: config.appId,
      projectId: config.projectId,
    });
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    if (config.tenantId) {
      auth.tenantId = config.tenantId;
    }

    const alertEl = document.getElementById("alert");
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");
    const tabLogin = document.getElementById("tab-login");
    const tabSignup = document.getElementById("tab-signup");
    const loginSubmit = document.getElementById("login-submit");
    const signupSubmit = document.getElementById("signup-submit");
    const resendVerificationButton = document.getElementById("resend-verification");
    const forgotPasswordButton = document.getElementById("forgot-password");
    const mfaBox = document.getElementById("mfa-box");
    const mfaCodeInput = document.getElementById("mfa-code");
    const mfaSubmit = document.getElementById("mfa-submit");
    const mfaCopy = document.getElementById("mfa-copy");
    const loginEmailInput = document.getElementById("login-email");
    const loginPasswordInput = document.getElementById("login-password");
    const signupEmailInput = document.getElementById("signup-email");
    const signupFirstNameInput = document.getElementById("signup-first-name");
    const signupLastNameInput = document.getElementById("signup-last-name");
    const signupPracticeNameInput = document.getElementById("signup-practice-name");
    const signupPasswordInput = document.getElementById("signup-password");
    const signupConfirmPasswordInput = document.getElementById("signup-confirm-password");

    let pendingMfaResolver = null;
    let pendingMfaHint = null;
    let unverifiedUser = null;

    function onboardingKey(email) {
      return "docuwhisper.identity.onboarding:" + String(email || "").trim().toLowerCase();
    }

    function saveOnboarding(email, data) {
      if (!email) return;
      localStorage.setItem(onboardingKey(email), JSON.stringify(data));
    }

    function readOnboarding(email) {
      if (!email) return null;
      const raw = localStorage.getItem(onboardingKey(email));
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }

    function clearOnboarding(email) {
      if (!email) return;
      localStorage.removeItem(onboardingKey(email));
    }

    function setMessage(message, tone = "info") {
      if (!message) {
        alertEl.textContent = "";
        alertEl.className = "alert";
        return;
      }
      alertEl.textContent = message;
      alertEl.className = "alert visible " + tone;
    }

    function setMode(mode) {
      const loginActive = mode === "login";
      tabLogin.classList.toggle("active", loginActive);
      tabSignup.classList.toggle("active", !loginActive);
      loginForm.classList.toggle("active", loginActive);
      signupForm.classList.toggle("active", !loginActive);
      history.replaceState(null, "", "/api/login?mode=" + mode);
      if (loginActive) {
        loginEmailInput.focus();
      } else {
        signupFirstNameInput.focus();
      }
    }

    function setLoading(button, loadingText, active) {
      button.disabled = active;
      if (!button.dataset.defaultLabel) {
        button.dataset.defaultLabel = button.textContent || "";
      }
      button.textContent = active ? loadingText : button.dataset.defaultLabel;
    }

    async function establishBackendSession(user) {
      const email = user.email || loginEmailInput.value.trim();
      const onboarding = readOnboarding(email) || {};
      const idToken = await user.getIdToken();
      const response = await fetch("/api/auth/identity/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          idToken,
          firstName: onboarding.firstName || "",
          lastName: onboarding.lastName || "",
          practiceName: onboarding.practiceName || "",
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Unable to establish the application session.");
      }

      clearOnboarding(email);
      await signOut(auth).catch(() => {});
      window.location.href = data.redirectTo || "/";
    }

    function revealMfa(resolver) {
      pendingMfaResolver = resolver;
      pendingMfaHint = resolver.hints.find((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID) || resolver.hints[0];
      if (!pendingMfaHint) {
        throw new Error("MFA is required, but no supported TOTP factor was found.");
      }
      mfaCopy.textContent = "Enter the code from your authenticator app for " + (pendingMfaHint.displayName || pendingMfaHint.factorId || "your account") + ".";
      mfaBox.classList.add("visible");
      mfaCodeInput.value = "";
      mfaCodeInput.focus();
    }

    async function finalizeSuccessfulLogin(user) {
      if (!user.emailVerified) {
        unverifiedUser = user;
        resendVerificationButton.classList.remove("hidden");
        setMessage("Verify your email address before continuing. We can resend the verification email from this page.", "error");
        return;
      }

      resendVerificationButton.classList.add("hidden");
      await establishBackendSession(user);
    }

    tabLogin.addEventListener("click", () => setMode("login"));
    tabSignup.addEventListener("click", () => setMode("signup"));

    resendVerificationButton.addEventListener("click", async () => {
      if (!unverifiedUser) {
        setMessage("Sign in first so we know which account to resend verification for.", "error");
        return;
      }

      setLoading(resendVerificationButton, "Sending...", true);
      try {
        await sendEmailVerification(unverifiedUser, { url: verificationUrl });
        setMessage("Verification email sent. After confirming it, return here and sign in again.", "info");
      } catch (error) {
        setMessage(error.message || "Unable to send verification email.", "error");
      } finally {
        setLoading(resendVerificationButton, "Sending...", false);
      }
    });

    forgotPasswordButton.addEventListener("click", async () => {
      const email = loginEmailInput.value.trim();
      if (!email) {
        setMessage("Enter your email address first, then request a password reset.", "error");
        return;
      }

      setLoading(forgotPasswordButton, "Sending reset...", true);
      try {
        await sendPasswordResetEmail(auth, email);
        setMessage("Password reset email sent. Check your inbox for the reset link.", "info");
      } catch (error) {
        setMessage(error.message || "Unable to send the password reset email.", "error");
      } finally {
        setLoading(forgotPasswordButton, "Sending reset...", false);
      }
    });

    mfaSubmit.addEventListener("click", async () => {
      if (!pendingMfaResolver || !pendingMfaHint) {
        setMessage("Start the login flow again to complete MFA.", "error");
        return;
      }
      const otp = mfaCodeInput.value.trim();
      if (!otp) {
        setMessage("Enter the code from your authenticator app.", "error");
        return;
      }

      setLoading(mfaSubmit, "Verifying...", true);
      try {
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(pendingMfaHint.uid, otp);
        const credential = await pendingMfaResolver.resolveSignIn(assertion);
        pendingMfaResolver = null;
        pendingMfaHint = null;
        mfaBox.classList.remove("visible");
        await finalizeSuccessfulLogin(credential.user);
      } catch (error) {
        setMessage(error.message || "The MFA code was not accepted.", "error");
      } finally {
        setLoading(mfaSubmit, "Verifying...", false);
      }
    });

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("");
      resendVerificationButton.classList.add("hidden");
      unverifiedUser = null;

      const email = loginEmailInput.value.trim();
      const password = loginPasswordInput.value;
      if (!email || !password) {
        setMessage("Enter your email address and password.", "error");
        return;
      }

      setLoading(loginSubmit, "Signing in...", true);
      try {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        await finalizeSuccessfulLogin(credential.user);
      } catch (error) {
        if (error.code === "auth/multi-factor-auth-required") {
          const resolver = getMultiFactorResolver(auth, error);
          revealMfa(resolver);
          setMessage("A second factor is required for this account.", "info");
        } else {
          setMessage(error.message || "Unable to sign in.", "error");
        }
      } finally {
        setLoading(loginSubmit, "Signing in...", false);
      }
    });

    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("");

      const firstName = signupFirstNameInput.value.trim();
      const lastName = signupLastNameInput.value.trim();
      const practiceName = signupPracticeNameInput.value.trim();
      const email = signupEmailInput.value.trim();
      const password = signupPasswordInput.value;
      const confirmPassword = signupConfirmPasswordInput.value;

      if (!firstName || !lastName || !practiceName || !email || !password) {
        setMessage("Complete every signup field before continuing.", "error");
        return;
      }

      if (password !== confirmPassword) {
        setMessage("The password confirmation does not match.", "error");
        return;
      }

      setLoading(signupSubmit, "Creating account...", true);
      try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();
        if (displayName) {
          await updateProfile(credential.user, { displayName });
        }
        saveOnboarding(email, { firstName, lastName, practiceName });
        await sendEmailVerification(credential.user, { url: verificationUrl });
        await signOut(auth).catch(() => {});
        loginEmailInput.value = email;
        signupPasswordInput.value = "";
        signupConfirmPasswordInput.value = "";
        setMode("login");
        setMessage("Account created. Check your email for the verification link, then sign in to finish setup.", "info");
      } catch (error) {
        setMessage(error.message || "Unable to create the account.", "error");
      } finally {
        setLoading(signupSubmit, "Creating account...", false);
      }
    });

    const googleButton = document.getElementById("google-signin");
    googleButton.addEventListener("click", async () => {
      setMessage("", "info");
      setLoading(googleButton, "Signing in with Google...", true);
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const displayName = user.displayName || "";
        const parts = displayName.split(" ");
        const firstName = parts.shift() || "";
        const lastName = parts.join(" ");
        saveOnboarding(user.email || "", { firstName, lastName, practiceName: "" });
        await establishBackendSession(user);
      } catch (error) {
        setLoading(googleButton, "", false);
        const code = error && error.code ? error.code : "";
        if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
          return;
        }
        if (code === "auth/operation-not-allowed") {
          setMessage("Google sign-in isn't enabled yet. Please use email/password while we finish configuring it.", "error");
          return;
        }
        setMessage((error && error.message) || "Google sign-in failed. Please try email/password.", "error");
      }
    });

    setMode(initialMode === "signup" ? "signup" : "login");
    if (initialMessage) {
      setMessage(initialMessage, "info");
    }
  </script>
</body>
</html>`;
}

export function getSession() {
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: SESSION_TTL_MS,
    tableName: "sessions",
  });
  return session({
    secret: getSessionSecret(),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: SESSION_TTL_MS,
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

function splitDisplayName(value: unknown): { firstName?: string; lastName?: string } {
  if (typeof value !== "string") return {};
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function deriveUserProfile(
  claims: Record<string, unknown>,
  overrides?: { firstName?: string; lastName?: string; profileImageUrl?: string | null }
) {
  const parsedName = splitDisplayName(claims["name"]);
  const firstName =
    overrides?.firstName?.trim() ||
    (typeof claims["first_name"] === "string" ? claims["first_name"].trim() : "") ||
    parsedName.firstName ||
    "";
  const lastName =
    overrides?.lastName?.trim() ||
    (typeof claims["last_name"] === "string" ? claims["last_name"].trim() : "") ||
    parsedName.lastName ||
    "";
  const profileImageUrl =
    overrides?.profileImageUrl ??
    (typeof claims["profile_image_url"] === "string"
      ? claims["profile_image_url"]
      : typeof claims["picture"] === "string"
        ? claims["picture"]
        : null);

  return {
    firstName,
    lastName,
    profileImageUrl,
  };
}

function buildIdentitySessionClaims(
  claims: IdentityPlatformClaims,
  overrides?: { firstName?: string; lastName?: string; profileImageUrl?: string | null }
) {
  const profile = deriveUserProfile(claims as unknown as Record<string, unknown>, overrides);
  return {
    sub: claims.sub,
    email: claims.email || null,
    email_verified: claims.email_verified === true,
    first_name: profile.firstName || null,
    last_name: profile.lastName || null,
    name: claims.name || [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() || null,
    profile_image_url: profile.profileImageUrl || null,
    firebase: claims.firebase,
  };
}

async function upsertUser(
  claims: Record<string, unknown>,
  overrides?: { firstName?: string; lastName?: string; profileImageUrl?: string | null }
) {
  const profile = deriveUserProfile(claims, overrides);
  const userId = typeof claims["sub"] === "string" ? claims["sub"] : "";
  const email = typeof claims["email"] === "string" ? claims["email"] : null;
  await authStorage.upsertUser({
    id: userId,
    email,
    firstName: profile.firstName || null,
    lastName: profile.lastName || null,
    profileImageUrl: profile.profileImageUrl || null,
  });
}

function getPendingRedirect(sessionData: any | undefined): string {
  const redirectTo = typeof sessionData?.returnTo === "string" ? sessionData.returnTo : "/";
  if (sessionData && "returnTo" in sessionData) {
    delete sessionData.returnTo;
  }
  return redirectTo;
}

async function establishSession(req: Request, userSession: Record<string, unknown>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    (req as any).login(userSession, (error: unknown) => {
      if (error) return reject(error);
      resolve();
    });
  });

  const sessionData = (req as any).session as any | undefined;
  const redirectTo = getPendingRedirect(sessionData);

  await new Promise<void>((resolve, reject) => {
    if (!sessionData || typeof sessionData.save !== "function") {
      return resolve();
    }
    sessionData.save((error: unknown) => {
      if (error) return reject(error);
      resolve();
    });
  });

  return redirectTo;
}

function derivePracticeName(
  providedPracticeName: string,
  firstName: string,
  lastName: string,
  email: string
): string {
  const trimmedPracticeName = providedPracticeName.trim();
  if (trimmedPracticeName) return trimmedPracticeName;

  const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ").trim();
  if (fullName) return `${fullName} Practice`;

  const emailPrefix = email.split("@")[0]?.trim();
  if (emailPrefix) return `${emailPrefix} Practice`;

  return "My Practice";
}

function buildIdentityPageMessage(req: Request): string {
  if (req.query.verified === "1") {
    return "Email verified. Sign in to finish setting up your workspace.";
  }
  if (req.query.reset === "1") {
    return "Password updated. Sign in with your new password.";
  }
  return "";
}

function registerLocalCredentialRoutes(
  app: Express,
  localAuthConfig: LocalAuthConfig,
  loginPath: string
) {
  app.get(loginPath, (req, res) => {
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
        formAction: loginPath,
      })
    );
  });

  app.post(loginPath, express.urlencoded({ extended: false }), async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    const usernameValid = username.length > 0 && constantTimeEquals(username, localAuthConfig.username);
    const passwordValid = password.length > 0 && constantTimeEquals(password, localAuthConfig.password);
    if (!usernameValid || !passwordValid) {
      return res.redirect(`${loginPath}?error=invalid_credentials`);
    }

    const expiresAt = Math.floor((Date.now() + SESSION_TTL_MS) / 1000);

    try {
      await authStorage.upsertUser({
        id: localAuthConfig.userId,
        email: localAuthConfig.userEmail,
        firstName: localAuthConfig.firstName,
        lastName: localAuthConfig.lastName,
        profileImageUrl: null,
      });

      const redirectTo = await establishSession(req, {
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
      });

      void logSecurityEvent(req, "login", localAuthConfig.userId, localAuthConfig.userEmail, {
        method: "local_password",
      });
      return res.redirect(redirectTo);
    } catch (error) {
      console.error("[local-auth] Login failed:", error);
      return res.redirect(`${loginPath}?error=login_failed`);
    }
  });
}

function registerSimpleLogoutRoute(app: Express) {
  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    const userId = user?.claims?.sub;
    const userEmail = user?.claims?.email;
    const redirectTo = getSafeLogoutRedirectUri(req);

    if (userId) {
      void logSecurityEvent(req, "logout", userId, userEmail);
    }

    req.logout(() => {
      const finalizeRedirect = () => {
        res.clearCookie("connect.sid", { path: "/" });
        res.redirect(redirectTo);
      };

      if (req.session) {
        req.session.destroy(() => finalizeRedirect());
        return;
      }

      finalizeRedirect();
    });
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
  const identityPlatformConfig = ensureIdentityPlatformConfig(getIdentityPlatformConfig());

  if (identityPlatformConfig.enabled) {
    if (localAuthConfig.enabled) {
      registerLocalCredentialRoutes(app, localAuthConfig, "/api/login/local");
    }

    app.get("/api/login", (req, res) => {
      if (req.isAuthenticated?.()) {
        const returnTo = typeof (req as any).session?.returnTo === "string" ? (req as any).session.returnTo : "/";
        return res.redirect(returnTo);
      }

      const requestedMode = req.query.mode === "signup" ? "signup" : "login";
      const appBaseUrl =
        identityPlatformConfig.appBaseUrl || `${req.protocol}://${req.get("host") || req.hostname}`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(
        renderIdentityPlatformLoginPage({
          config: identityPlatformConfig,
          appBaseUrl,
          initialMode: requestedMode,
          message: buildIdentityPageMessage(req),
          showLocalFallback: localAuthConfig.enabled,
        })
      );
    });

    app.post("/api/auth/identity/session", express.json(), async (req, res) => {
      const idToken = typeof req.body?.idToken === "string" ? req.body.idToken.trim() : "";
      const firstName = typeof req.body?.firstName === "string" ? req.body.firstName.trim() : "";
      const lastName = typeof req.body?.lastName === "string" ? req.body.lastName.trim() : "";
      const practiceName = typeof req.body?.practiceName === "string" ? req.body.practiceName.trim() : "";

      if (!idToken) {
        return res.status(400).json({ message: "Identity token is required." });
      }

      try {
        const claims = await verifyIdentityPlatformIdToken(idToken, identityPlatformConfig);
        if (!claims.email) {
          return res.status(400).json({ message: "Authenticated account is missing an email address." });
        }
        if (claims.email_verified !== true) {
          return res.status(403).json({ message: "Verify your email address before signing in." });
        }

        const normalizedClaims = buildIdentitySessionClaims(claims, { firstName, lastName });
        await upsertUser(claims as unknown as Record<string, unknown>, {
          firstName: normalizedClaims.first_name || undefined,
          lastName: normalizedClaims.last_name || undefined,
          profileImageUrl: normalizedClaims.profile_image_url,
        });

        const userPractices = await storage.getUserPractices(claims.sub);
        let createdPractice: { id: number; name: string } | null = null;
        if (userPractices.length === 0) {
          const derivedPracticeName = derivePracticeName(
            practiceName,
            normalizedClaims.first_name || "",
            normalizedClaims.last_name || "",
            claims.email
          );
          const practice = await storage.createPractice({
            name: derivedPracticeName,
            ownerId: claims.sub,
            description: "Practice created automatically during account setup.",
          });
          createdPractice = {
            id: practice.id,
            name: practice.name,
          };

          await storage.upsertUserSettings({
            userId: claims.sub,
            firstName: normalizedClaims.first_name || null,
            lastName: normalizedClaims.last_name || null,
            practiceName: practice.name,
          });

          const existingSubscription = await storage.getSubscription(claims.sub);
          if (!existingSubscription) {
            const trialPeriodEnd = getTrialPeriodEnd();
            if (trialPeriodEnd) {
              await storage.upsertSubscription({
                userId: claims.sub,
                status: "active",
                currentPeriodEnd: trialPeriodEnd,
              });
            }
          }

          captureSignupCompleted(claims.sub, {
            signup_method: "identity_platform",
          });
        }

        const expiresAt = Math.floor((Date.now() + SESSION_TTL_MS) / 1000);
        const redirectTo = await establishSession(req, {
          claims: {
            ...normalizedClaims,
            exp: expiresAt,
          },
          access_token: "identity_platform",
          refresh_token: undefined,
          expires_at: expiresAt,
        });

        void logSecurityEvent(req, "login", claims.sub, claims.email, {
          method: "identity_platform",
          createdPractice: !!createdPractice,
        });

        return res.status(200).json({
          ok: true,
          redirectTo,
          createdPractice,
        });
      } catch (error) {
        console.error("[identity-platform] Session establishment failed:", error);
        return res.status(401).json({ message: "Unable to verify the signed-in user." });
      }
    });

    app.get("/api/callback", (_req, res) => {
      res.redirect("/api/login");
    });

    registerSimpleLogoutRoute(app);
    return;
  }

  if (localAuthConfig.enabled) {
    registerLocalCredentialRoutes(app, localAuthConfig, "/api/login");

    app.get("/api/callback", (_req, res) => {
      res.redirect("/api/login");
    });

    registerSimpleLogoutRoute(app);
    return;
  }

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    const claims = tokens.claims();
    if (!claims) {
      return verified(new Error("Missing ID token claims"));
    }
    await upsertUser(claims);
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
    const redirectTo = getSafeLogoutRedirectUri(req);
    
    // Log logout event before session destruction
    if (userId) {
      logSecurityEvent(req, 'logout', userId, userEmail);
    }
    
    req.logout(() => {
      const finalizeRedirect = () => {
        res.clearCookie("connect.sid", { path: "/" });
        if (redirectTo !== "/") {
          res.redirect(redirectTo);
          return;
        }

        res.redirect(
          client.buildEndSessionUrl(config, {
            client_id: getReplitClientId(),
            post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
          }).href
        );
      };

      if (req.session) {
        req.session.destroy(() => finalizeRedirect());
        return;
      }

      finalizeRedirect();
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > user.expires_at) {
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    try {
      const config = await getOidcConfig();
      const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
      updateUserSession(user, tokenResponse);
    } catch (error) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
  }

  const userId = typeof user?.claims?.sub === "string" ? user.claims.sub : "";
  const userEmail =
    typeof user?.claims?.email === "string" ? user.claims.email.trim().toLowerCase() : "";
  const adminAccess = await resolveAdminAccess({
    userId,
    userEmail,
  });

  if (adminAccess.isAdmin) {
    return next();
  }

  if (shouldBypassSubscriptionGate(req.path)) {
    return next();
  }

  if (userId) {
    const subscription = await normalizeExpiredSubscriptionStatus(
      userId,
      await storage.getSubscription(userId),
    );

    if (hasSubscriptionAccess(subscription)) {
      return next();
    }
  }

  return res.status(402).json({
    code: "subscription_required",
    message: "Your trial has ended. Subscribe to continue using DocuWhisper.",
  });
};
