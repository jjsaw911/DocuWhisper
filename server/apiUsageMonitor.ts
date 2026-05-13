type StatusBucket = "2xx" | "3xx" | "4xx" | "5xx" | "other";

type RouteStats = {
  requests: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
  statusOther: number;
  lastRequestAt: number;
};

type RecordEventParams = {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestamp?: number;
};

type RouteSummary = {
  method: string;
  path: string;
  requests: number;
  errors: number;
  errorRate: number;
  avgDurationMs: number;
  maxDurationMs: number;
  statusCounts: Record<StatusBucket, number>;
  lastRequestAt: string;
};

const BUCKET_MS = 60 * 1000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

const routeBuckets = new Map<string, RouteStats>();
let lastCleanupAt = 0;
const collectionStartedAt = Date.now();

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const isObjectIdLike = (value: string) => /^[0-9a-f]{24}$/i.test(value);

const isNumericId = (value: string) => /^\d+$/.test(value);

const toStatusBucket = (statusCode: number): StatusBucket => {
  if (statusCode >= 200 && statusCode < 300) return "2xx";
  if (statusCode >= 300 && statusCode < 400) return "3xx";
  if (statusCode >= 400 && statusCode < 500) return "4xx";
  if (statusCode >= 500 && statusCode < 600) return "5xx";
  return "other";
};

const normalizeApiPath = (path: string): string => {
  const rawPath = (path || "/").split("?")[0];
  const segments = rawPath.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  const normalized = segments.map((segment) => {
    if (!segment) return segment;
    if (isNumericId(segment) || isUuidLike(segment) || isObjectIdLike(segment)) return ":id";
    if (segment.length > 32 && /[0-9]/.test(segment)) return ":id";
    return segment;
  });

  return `/${normalized.join("/")}`;
};

const parseBucketKey = (key: string): { bucketStart: number; method: string; path: string } | null => {
  const firstSeparator = key.indexOf("|");
  if (firstSeparator === -1) return null;
  const secondSeparator = key.indexOf("|", firstSeparator + 1);
  if (secondSeparator === -1) return null;

  const bucketStart = Number.parseInt(key.slice(0, firstSeparator), 10);
  if (!Number.isFinite(bucketStart)) return null;

  return {
    bucketStart,
    method: key.slice(firstSeparator + 1, secondSeparator),
    path: key.slice(secondSeparator + 1),
  };
};

const cleanupOldBuckets = (now: number) => {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  const oldest = now - RETENTION_MS;

  for (const key of routeBuckets.keys()) {
    const parsed = parseBucketKey(key);
    if (!parsed || parsed.bucketStart < oldest) {
      routeBuckets.delete(key);
    }
  }
};

export const recordApiUsage = (params: RecordEventParams) => {
  if (!params.path.startsWith("/api")) return;

  const now = params.timestamp ?? Date.now();
  cleanupOldBuckets(now);

  const method = (params.method || "GET").toUpperCase();
  const normalizedPath = normalizeApiPath(params.path);
  const bucketStart = now - (now % BUCKET_MS);
  const bucketKey = `${bucketStart}|${method}|${normalizedPath}`;
  const existing = routeBuckets.get(bucketKey);
  const statusBucket = toStatusBucket(params.statusCode);

  const next: RouteStats = existing
    ? { ...existing }
    : {
        requests: 0,
        errors: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
        status2xx: 0,
        status3xx: 0,
        status4xx: 0,
        status5xx: 0,
        statusOther: 0,
        lastRequestAt: 0,
      };

  next.requests += 1;
  if (params.statusCode >= 400) next.errors += 1;
  next.totalDurationMs += Math.max(0, Math.round(params.durationMs || 0));
  next.maxDurationMs = Math.max(next.maxDurationMs, Math.max(0, Math.round(params.durationMs || 0)));
  next.lastRequestAt = Math.max(next.lastRequestAt, now);

  if (statusBucket === "2xx") next.status2xx += 1;
  else if (statusBucket === "3xx") next.status3xx += 1;
  else if (statusBucket === "4xx") next.status4xx += 1;
  else if (statusBucket === "5xx") next.status5xx += 1;
  else next.statusOther += 1;

  routeBuckets.set(bucketKey, next);
};

export const getApiUsageSummary = (params: { windowHours?: number; limit?: number } = {}) => {
  const rawWindowHours = Number.isFinite(params.windowHours) ? Number(params.windowHours) : 24;
  const windowHours = Math.min(Math.max(rawWindowHours, 1), 24 * 30);
  const rawLimit = Number.isFinite(params.limit) ? Number(params.limit) : 20;
  const limit = Math.min(Math.max(rawLimit, 1), 100);

  const now = Date.now();
  const windowStart = now - windowHours * 60 * 60 * 1000;

  const routeAggregate = new Map<string, RouteStats>();

  for (const [bucketKey, stats] of routeBuckets.entries()) {
    const parsed = parseBucketKey(bucketKey);
    if (!parsed || parsed.bucketStart < windowStart) continue;

    const routeKey = `${parsed.method}|${parsed.path}`;
    const existing = routeAggregate.get(routeKey);
    if (!existing) {
      routeAggregate.set(routeKey, { ...stats });
      continue;
    }

    existing.requests += stats.requests;
    existing.errors += stats.errors;
    existing.totalDurationMs += stats.totalDurationMs;
    existing.maxDurationMs = Math.max(existing.maxDurationMs, stats.maxDurationMs);
    existing.status2xx += stats.status2xx;
    existing.status3xx += stats.status3xx;
    existing.status4xx += stats.status4xx;
    existing.status5xx += stats.status5xx;
    existing.statusOther += stats.statusOther;
    existing.lastRequestAt = Math.max(existing.lastRequestAt, stats.lastRequestAt);
  }

  let totalRequests = 0;
  let totalErrors = 0;
  let totalDurationMs = 0;
  let maxDurationMs = 0;
  let total2xx = 0;
  let total3xx = 0;
  let total4xx = 0;
  let total5xx = 0;
  let totalOther = 0;

  const topRoutes: RouteSummary[] = Array.from(routeAggregate.entries())
    .map(([routeKey, stats]) => {
      const [method, path] = routeKey.split("|", 2);
      totalRequests += stats.requests;
      totalErrors += stats.errors;
      totalDurationMs += stats.totalDurationMs;
      maxDurationMs = Math.max(maxDurationMs, stats.maxDurationMs);
      total2xx += stats.status2xx;
      total3xx += stats.status3xx;
      total4xx += stats.status4xx;
      total5xx += stats.status5xx;
      totalOther += stats.statusOther;

      return {
        method,
        path,
        requests: stats.requests,
        errors: stats.errors,
        errorRate: stats.requests > 0 ? stats.errors / stats.requests : 0,
        avgDurationMs: stats.requests > 0 ? Math.round(stats.totalDurationMs / stats.requests) : 0,
        maxDurationMs: stats.maxDurationMs,
        statusCounts: {
          "2xx": stats.status2xx,
          "3xx": stats.status3xx,
          "4xx": stats.status4xx,
          "5xx": stats.status5xx,
          other: stats.statusOther,
        },
        lastRequestAt: new Date(stats.lastRequestAt).toISOString(),
      };
    })
    .sort((a, b) => b.requests - a.requests)
    .slice(0, limit);

  return {
    generatedAt: new Date(now).toISOString(),
    dataAvailableSince: new Date(collectionStartedAt).toISOString(),
    windowHours,
    totals: {
      requests: totalRequests,
      errors: totalErrors,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      avgDurationMs: totalRequests > 0 ? Math.round(totalDurationMs / totalRequests) : 0,
      maxDurationMs,
      statusCounts: {
        "2xx": total2xx,
        "3xx": total3xx,
        "4xx": total4xx,
        "5xx": total5xx,
        other: totalOther,
      },
    },
    topRoutes,
  };
};
