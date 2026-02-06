import { Request, Response, NextFunction } from "express";
import { storage, hashApiKey } from "./storage";
import { PersonalApiKey } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      personalApiKey?: PersonalApiKey;
      mobileUserId?: string;
    }
  }
}

const rateLimitMap = new Map<number, { count: number; resetTime: number }>();

export async function mobileApiAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid Authorization header. Use 'Bearer <api_key>'",
    });
  }
  
  const rawKey = authHeader.substring(7);
  
  if (!rawKey.startsWith("dw_pk_")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid API key format. Personal API keys start with 'dw_pk_'",
    });
  }
  
  const keyHash = hashApiKey(rawKey);
  const apiKey = await storage.getPersonalApiKeyByHash(keyHash);
  
  if (!apiKey) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid API key",
    });
  }
  
  if (apiKey.status === "revoked") {
    return res.status(401).json({
      error: "unauthorized",
      message: "API key has been revoked",
    });
  }
  
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
    return res.status(401).json({
      error: "unauthorized",
      message: "API key has expired",
    });
  }
  
  const now = Date.now();
  const rateLimit = rateLimitMap.get(apiKey.id);
  const rateLimitPerMinute = apiKey.rateLimitPerMinute || 30;
  
  if (rateLimit) {
    if (now < rateLimit.resetTime) {
      if (rateLimit.count >= rateLimitPerMinute) {
        const retryAfter = Math.ceil((rateLimit.resetTime - now) / 1000);
        res.setHeader("X-RateLimit-Limit", rateLimitPerMinute.toString());
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", Math.ceil(rateLimit.resetTime / 1000).toString());
        res.setHeader("Retry-After", retryAfter.toString());
        return res.status(429).json({
          error: "rate_limit_exceeded",
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds`,
          retryAfter,
        });
      }
      rateLimit.count++;
    } else {
      rateLimitMap.set(apiKey.id, { count: 1, resetTime: now + 60000 });
    }
  } else {
    rateLimitMap.set(apiKey.id, { count: 1, resetTime: now + 60000 });
  }
  
  const currentRateInfo = rateLimitMap.get(apiKey.id)!;
  res.setHeader("X-RateLimit-Limit", rateLimitPerMinute.toString());
  res.setHeader("X-RateLimit-Remaining", Math.max(0, rateLimitPerMinute - currentRateInfo.count).toString());
  res.setHeader("X-RateLimit-Reset", Math.ceil(currentRateInfo.resetTime / 1000).toString());
  
  storage.updatePersonalApiKeyLastUsed(apiKey.id).catch(() => {});
  
  req.personalApiKey = apiKey;
  req.mobileUserId = apiKey.userId;
  
  next();
}

export function requireMobileScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.personalApiKey) {
      return res.status(401).json({
        error: "unauthorized",
        message: "API key authentication required",
      });
    }
    
    if (!req.personalApiKey.scopes.includes(scope)) {
      return res.status(403).json({
        error: "forbidden",
        message: `This action requires the '${scope}' scope`,
        requiredScope: scope,
        currentScopes: req.personalApiKey.scopes,
      });
    }
    
    next();
  };
}
