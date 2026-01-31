import { Request, Response, NextFunction } from "express";
import { storage, hashApiKey } from "./storage";
import { ApiKey, Practice } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
      apiPractice?: Practice;
    }
  }
}

const rateLimitMap = new Map<number, { count: number; resetTime: number }>();

export async function externalApiAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid Authorization header. Use 'Bearer <api_key>'",
    });
  }
  
  const rawKey = authHeader.substring(7);
  
  if (!rawKey.startsWith("dw_live_")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid API key format",
    });
  }
  
  const keyHash = hashApiKey(rawKey);
  const apiKey = await storage.getApiKeyByHash(keyHash);
  
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
  
  if (apiKey.status === "expired" || (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date())) {
    return res.status(401).json({
      error: "unauthorized",
      message: "API key has expired",
    });
  }
  
  const practice = await storage.getPractice(apiKey.practiceId);
  if (!practice) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Organization not found for this API key",
    });
  }
  
  if (!practice.hasEmrLicense) {
    return res.status(403).json({
      error: "forbidden",
      message: "Organization does not have an active EMR license",
    });
  }
  
  const now = Date.now();
  const rateLimit = rateLimitMap.get(apiKey.id);
  const rateLimitPerMinute = apiKey.rateLimitPerMinute || 60;
  
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
  
  storage.updateApiKeyLastUsed(apiKey.id).catch(() => {});
  
  req.apiKey = apiKey;
  req.apiPractice = practice;
  
  next();
}

export function requireScope(...scopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.apiKey) {
      return res.status(401).json({
        error: "unauthorized",
        message: "API key not authenticated",
      });
    }
    
    const hasRequiredScope = scopes.some(scope => req.apiKey!.scopes.includes(scope));
    
    if (!hasRequiredScope) {
      return res.status(403).json({
        error: "forbidden",
        message: `This endpoint requires one of the following scopes: ${scopes.join(", ")}`,
        requiredScopes: scopes,
        currentScopes: req.apiKey.scopes,
      });
    }
    
    next();
  };
}
