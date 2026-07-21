import { NextRequest, NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/types';
import {
  gitHubCacheHeaders,
  gitHubRouteErrorResponse,
  listUserRepos,
} from '@/lib/server/github';
import {
  clientIp,
  getGitHubRateLimiter,
  rateLimitExceededResponse,
} from '@/lib/server/rate-limit';
import { GITHUB_PAGE_MAX, isValidGitHubUsername, parseBoundedInt } from '@/lib/server/validate';

function invalidInput(message: string): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: { code: 'INVALID_INPUT', message, retryAfter: null },
  };
  return NextResponse.json(body, {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const user = searchParams.get('user');
  if (user === null || !isValidGitHubUsername(user)) {
    return invalidInput('Invalid GitHub username.');
  }
  let page: number;
  try {
    page = parseBoundedInt(searchParams.get('page'), 1, 1, GITHUB_PAGE_MAX, 'Invalid page number.');
  } catch {
    return invalidInput('Invalid page number.');
  }
  const limit = getGitHubRateLimiter().check(clientIp(request));
  if (!limit.allowed) return rateLimitExceededResponse(limit);
  try {
    const envelope = await listUserRepos(user, page);
    return NextResponse.json(envelope, { headers: gitHubCacheHeaders() });
  } catch (error) {
    return gitHubRouteErrorResponse(error);
  }
}
