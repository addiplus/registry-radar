import { afterEach, describe, expect, it } from 'vitest';

import type { ApiErrorBody } from '@/lib/types';
import {
  clientIp,
  createRateLimiter,
  rateLimitExceededResponse,
  rateLimitMaxFromEnv,
} from '@/lib/server/rate-limit';

describe('createRateLimiter', () => {
  it('allows up to max requests per window, then denies with retry metadata', () => {
    const nowMs = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => nowMs });

    const first = limiter.check('ip-1');
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const second = limiter.check('ip-1');
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    const third = limiter.check('ip-1');
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.resetAt).toBe(1000);
    expect(third.retryAfterSeconds).toBe(1);
  });

  it('opens a fresh window after windowMs elapses', () => {
    let nowMs = 0;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => nowMs });

    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(false);

    nowMs = 1000;
    const afterReset = limiter.check('ip-1');
    expect(afterReset.allowed).toBe(true);
    expect(afterReset.resetAt).toBe(2000);
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.check('ip-1').allowed).toBe(true);
    expect(limiter.check('ip-2').allowed).toBe(true);
    expect(limiter.check('ip-1').allowed).toBe(false);
  });

  it('uses Date.now when no clock is injected', () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000 });
    const result = limiter.check('ip-1');
    expect(result.allowed).toBe(true);
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

describe('rateLimitMaxFromEnv', () => {
  afterEach(() => {
    delete process.env.RR_RATE_LIMIT_MAX;
  });

  it('returns the fallback when unset', () => {
    delete process.env.RR_RATE_LIMIT_MAX;
    expect(rateLimitMaxFromEnv(30)).toBe(30);
  });

  it('honors a positive integer override', () => {
    process.env.RR_RATE_LIMIT_MAX = '2';
    expect(rateLimitMaxFromEnv(30)).toBe(2);
  });

  it.each(['0', '-3', 'abc', '2.5', ''])('ignores invalid value %s', (raw) => {
    process.env.RR_RATE_LIMIT_MAX = raw;
    expect(rateLimitMaxFromEnv(30)).toBe(30);
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(clientIp({ headers })).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '9.9.9.9' });
    expect(clientIp({ headers })).toBe('9.9.9.9');
  });

  it('falls back to unknown when no forwarding headers exist', () => {
    expect(clientIp({ headers: new Headers() })).toBe('unknown');
  });
});

describe('rateLimitExceededResponse', () => {
  it('returns a 429 in the ApiErrorBody contract with retryAfter and no-store', async () => {
    const response = rateLimitExceededResponse({
      allowed: false,
      remaining: 0,
      resetAt: 1_700_000_060_000,
      retryAfterSeconds: 42,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('42');

    const body = (await response.json()) as ApiErrorBody;
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryAfter).toBe(1_700_000_060_000);
    expect(typeof body.error.message).toBe('string');
  });
});
