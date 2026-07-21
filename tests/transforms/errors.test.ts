import { describe, expect, it } from 'vitest';

import { gitHubError, npmError } from '@/lib/transforms/errors';

describe('npmError', () => {
  it('maps 404 to NOT_FOUND and 5xx to UPSTREAM', () => {
    expect(npmError(404)).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Package not found on npm.',
        retryAfter: null,
      },
    });
    expect(npmError(500).error.code).toBe('UPSTREAM');
    expect(npmError(503).error.code).toBe('UPSTREAM');
    // A 400 is impossible by construction; treated as UPSTREAM if seen.
    expect(npmError(400).error.code).toBe('UPSTREAM');
  });
});

describe('gitHubError', () => {
  it('maps 403 with remaining 0 to RATE_LIMITED with retryAfter = reset x 1000', () => {
    const headers = new Headers({
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '1893456000',
    });
    const body = gitHubError(403, headers);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.retryAfter).toBe(1893456000 * 1000);
    expect(body.error.message).toBe(
      'GitHub API rate limit reached. Try again after the reset time.',
    );
  });

  it('maps 403 with Retry-After to SECONDARY_LIMIT with retryAfter in the future', () => {
    const before = Date.now();
    const body = gitHubError(403, new Headers({ 'retry-after': '60' }));
    expect(body.error.code).toBe('SECONDARY_LIMIT');
    expect(body.error.retryAfter).not.toBeNull();
    expect(body.error.retryAfter as number).toBeGreaterThan(before);
    expect(body.error.retryAfter as number).toBeLessThanOrEqual(Date.now() + 60 * 1000);

    // A plain 404 still maps to NOT_FOUND.
    expect(gitHubError(404, new Headers()).error.code).toBe('NOT_FOUND');
  });
});
