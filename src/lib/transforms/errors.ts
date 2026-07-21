import type { ApiErrorBody, ApiErrorCode } from '../types';

// Shared upstream error mapping (plan section 3). Route handlers call
// these, then NextResponse.json(body, { status: httpStatusFor(code) }).

export function npmError(status: number): ApiErrorBody {
  if (status === 404) {
    return body('NOT_FOUND', 'Package not found on npm.', null);
  }
  // Plan section 12: an npm 400 is impossible by construction (the route
  // controls every parameter), so it is treated as UPSTREAM if it ever
  // appears. 5xx and network failures land here too.
  return body('UPSTREAM', 'npm data unavailable. Try again shortly.', null);
}

export function gitHubError(status: number, headers: Headers): ApiErrorBody {
  if (status === 403) {
    // Primary rate limit: remaining 0, reset is epoch seconds.
    if (headers.get('x-ratelimit-remaining') === '0') {
      const resetRaw = headers.get('x-ratelimit-reset');
      const reset = resetRaw === null ? NaN : Number(resetRaw);
      return body(
        'RATE_LIMITED',
        'GitHub API rate limit reached. Try again after the reset time.',
        Number.isFinite(reset) ? reset * 1000 : null,
      );
    }
    // Secondary (abuse) limit: Retry-After in seconds from now.
    const retryAfterRaw = headers.get('retry-after');
    if (retryAfterRaw !== null) {
      const seconds = Number(retryAfterRaw);
      return body(
        'SECONDARY_LIMIT',
        'GitHub secondary rate limit hit. Try again shortly.',
        Number.isFinite(seconds) ? Date.now() + seconds * 1000 : null,
      );
    }
  }
  if (status === 404) {
    return body('NOT_FOUND', 'GitHub repository or user not found.', null);
  }
  if (status === 400) {
    return body('BAD_REQUEST', 'GitHub could not process the request.', null);
  }
  return body('UPSTREAM', 'GitHub data unavailable. Try again shortly.', null);
}

// Status passthrough (plan section 3): upstream 404 to our 404, GitHub
// 403 to our 403, our validation to 400, upstream 5xx to our 502.
export function httpStatusFor(code: ApiErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'RATE_LIMITED':
    case 'SECONDARY_LIMIT':
      return 403;
    case 'BAD_REQUEST':
    case 'INVALID_INPUT':
      return 400;
    case 'UPSTREAM':
      return 502;
  }
}

function body(code: ApiErrorCode, message: string, retryAfter: number | null): ApiErrorBody {
  return { error: { code, message, retryAfter } };
}
