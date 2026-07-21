import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/types';

// ---------------------------------------------------------------------------
// Lightweight per-IP fixed-window rate limiter for the public proxy routes
// (security fix G1, review F1). In-memory and per-instance by design: on
// serverless, each warm instance keeps its own counters, so this is a soft
// limit that blunts casual abuse rather than a hard global quota, acceptable
// for v1; swap for a shared store (e.g. Upstash Ratelimit) if a hard limit is
// ever required. No dependencies.
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the current window ends
  retryAfterSeconds: number; // 0 when allowed
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

interface Bucket {
  count: number;
  resetAt: number;
}

// Past this many distinct keys, expired buckets are swept on check so a flood
// of spoofed IPs cannot grow the map without bound.
const SWEEP_THRESHOLD = 5000;

export function createRateLimiter(options: {
  max: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();
  return {
    check(key: string): RateLimitResult {
      const nowMs = now();
      if (buckets.size > SWEEP_THRESHOLD) {
        for (const [bucketKey, bucket] of buckets) {
          if (nowMs >= bucket.resetAt) buckets.delete(bucketKey);
        }
      }
      let bucket = buckets.get(key);
      if (bucket === undefined || nowMs >= bucket.resetAt) {
        bucket = { count: 0, resetAt: nowMs + options.windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (bucket.count > options.max) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: bucket.resetAt,
          retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000)),
        };
      }
      return {
        allowed: true,
        remaining: options.max - bucket.count,
        resetAt: bucket.resetAt,
        retryAfterSeconds: 0,
      };
    },
  };
}

// Defaults: GitHub-backed routes burn a shared upstream token budget, so they
// get the tighter cap; npm-backed routes tolerate more. RR_RATE_LIMIT_MAX
// overrides both (test/ops hook).
export const GITHUB_RATE_LIMIT_MAX = 30;
export const NPM_RATE_LIMIT_MAX = 60;
const WINDOW_MS = 60_000;

export function rateLimitMaxFromEnv(fallback: number): number {
  const raw = process.env.RR_RATE_LIMIT_MAX;
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Cached on globalThis so dev HMR does not recreate (and reset) the limiters
// on every reload, using the same pattern as the watchlist store factory.
const globalForRateLimit = globalThis as typeof globalThis & {
  __registryRadarGitHubRateLimiter?: RateLimiter;
  __registryRadarNpmRateLimiter?: RateLimiter;
};

export function getGitHubRateLimiter(): RateLimiter {
  globalForRateLimit.__registryRadarGitHubRateLimiter ??= createRateLimiter({
    max: rateLimitMaxFromEnv(GITHUB_RATE_LIMIT_MAX),
    windowMs: WINDOW_MS,
  });
  return globalForRateLimit.__registryRadarGitHubRateLimiter;
}

export function getNpmRateLimiter(): RateLimiter {
  globalForRateLimit.__registryRadarNpmRateLimiter ??= createRateLimiter({
    max: rateLimitMaxFromEnv(NPM_RATE_LIMIT_MAX),
    windowMs: WINDOW_MS,
  });
  return globalForRateLimit.__registryRadarNpmRateLimiter;
}

// Structural type: anything with headers (NextRequest included) works, which
// keeps this unit-testable without constructing Next internals.
export function clientIp(request: { headers: Headers }): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  return realIp || 'unknown';
}

// Over-limit response in the ApiErrorBody contract: RATE_LIMITED + retryAfter
// (epoch ms) in the body, Retry-After (seconds) as a header, never cached.
export function rateLimitExceededResponse(result: RateLimitResult): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Try again shortly.',
      retryAfter: result.resetAt,
    },
  };
  return NextResponse.json(body, {
    status: 429,
    headers: {
      'Cache-Control': 'no-store',
      'Retry-After': String(result.retryAfterSeconds),
    },
  });
}
