import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { runMigrations } from "stripe-replit-sync";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { getStripeSync } from "./stripeClient";
import { WebhookHandlers } from "./webhookHandlers";
import { setupWebSocket } from "./websocket";
import { recordApiUsage } from "./apiUsageMonitor";
import { runWithRequestContext } from "./requestContext";
import { validateTranscriptionProviderConfig } from "./sttClient";

const app = express();
const httpServer = createServer(app);

// Setup WebSocket for real-time collaboration
setupWebSocket(httpServer);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.warn("DATABASE_URL not set - Stripe integration disabled");
    return;
  }

  try {
    log("Initializing Stripe schema...", "stripe");
    await runMigrations({ databaseUrl });
    log("Stripe schema ready", "stripe");

    const stripeSync = await getStripeSync();

    log("Setting up managed webhook...", "stripe");
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      if (result?.webhook?.url) {
        log(`Webhook configured: ${result.webhook.url}`, "stripe");
      } else {
        log("Webhook setup skipped (no URL returned)", "stripe");
      }
    } catch (webhookError: any) {
      log(`Webhook setup warning: ${webhookError.message}`, "stripe");
    }

    stripeSync.syncBackfill().then(() => {
      log("Stripe data synced", "stripe");
    }).catch((err: any) => {
      console.error("Error syncing Stripe data:", err);
    });
  } catch (error) {
    console.error("Failed to initialize Stripe:", error);
  }
}

(async () => {
  validateTranscriptionProviderConfig();
  await initStripe();

  app.use(cookieParser());

  const pendingMobileAuths = new Map<string, { redirectUri: string; createdAt: number }>();

  setInterval(() => {
    const now = Date.now();
    pendingMobileAuths.forEach((val, key) => {
      if (now - val.createdAt > 10 * 60 * 1000) pendingMobileAuths.delete(key);
    });
  }, 60 * 1000);

  app.use("/api/callback", (req: Request, _res: Response, next: NextFunction) => {
    const mobileRedirect = req.cookies?.mobile_auth_redirect;
    const sid = req.cookies?.["connect.sid"];
    if (mobileRedirect && sid) {
      console.log("[mobile-auth] Preserving redirect URI before OAuth callback, sid prefix:", sid.substring(0, 12));
      pendingMobileAuths.set(sid, { redirectUri: decodeURIComponent(mobileRedirect), createdAt: Date.now() });
    }
    next();
  });

  await setupAuth(app);
  registerAuthRoutes(app);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const forwardedProto = req.get("x-forwarded-proto");
    const secureCookie = req.secure || forwardedProto === "https";
    const sameSite = secureCookie ? ("none" as const) : ("lax" as const);

    const mobileRedirect = req.cookies?.mobile_auth_redirect;
    const isAuthed = (req as any).isAuthenticated?.();
    const isExcluded = req.path.startsWith("/api/mobile/auth/") ||
      req.path.startsWith("/api/login") ||
      req.path.startsWith("/api/callback");

    if (mobileRedirect && isAuthed && !isExcluded) {
      console.log("[mobile-auth] Middleware intercepting authenticated request at", req.path, "→ redirecting to /api/mobile/auth/callback");
      return res.redirect("/api/mobile/auth/callback");
    }

    if (!mobileRedirect && isAuthed && !isExcluded) {
      const sid = req.cookies?.["connect.sid"];
      if (sid) {
        const pending = pendingMobileAuths.get(sid);
        if (pending) {
          console.log("[mobile-auth] Recovered redirect from pre-auth capture for sid prefix:", sid.substring(0, 12));
          res.cookie("mobile_auth_redirect", pending.redirectUri, {
            httpOnly: true,
            secure: secureCookie,
            maxAge: 5 * 60 * 1000,
            sameSite,
          });
          pendingMobileAuths.delete(sid);
          return res.redirect("/api/mobile/auth/callback");
        }
      }

      const userId = (req.user as any)?.claims?.sub;
      if (userId) {
        let foundKey: string | null = null;
        let foundVal: { redirectUri: string; createdAt: number } | null = null;
        pendingMobileAuths.forEach((val, key) => {
          if (!foundKey && Date.now() - val.createdAt < 60 * 1000) {
            foundKey = key;
            foundVal = val;
          }
        });
        if (foundKey && foundVal) {
          console.log("[mobile-auth] Recovered redirect from recent pending auth for user:", userId);
          res.cookie("mobile_auth_redirect", (foundVal as any).redirectUri, {
            httpOnly: true,
            secure: secureCookie,
            maxAge: 5 * 60 * 1000,
            sameSite,
          });
          pendingMobileAuths.delete(foundKey);
          return res.redirect("/api/mobile/auth/callback");
        }
      }
    }

    next();
  });

  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const signature = req.headers["stripe-signature"];

      if (!signature) {
        return res.status(400).json({ error: "Missing stripe-signature" });
      }

      try {
        const sig = Array.isArray(signature) ? signature[0] : signature;

        if (!Buffer.isBuffer(req.body)) {
          console.error("STRIPE WEBHOOK ERROR: req.body is not a Buffer");
          return res.status(500).json({ error: "Webhook processing error" });
        }

        await WebhookHandlers.processWebhook(req.body as Buffer, sig);
        res.status(200).json({ received: true });
      } catch (error: any) {
        console.error("Webhook error:", error.message);
        res.status(400).json({ error: "Webhook processing error" });
      }
    }
  );

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: false }));

  app.use((req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const claims = user?.claims;
    runWithRequestContext(
      {
        userId: claims?.sub || user?.id || undefined,
        userEmail: claims?.email || null,
        method: req.method,
        path: req.path,
      },
      () => next(),
    );
  });

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        recordApiUsage({
          method: req.method,
          path,
          statusCode: res.statusCode,
          durationMs: duration,
        });

        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        log(logLine);
      }
    });

    next();
  });

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    }
  );
})();
