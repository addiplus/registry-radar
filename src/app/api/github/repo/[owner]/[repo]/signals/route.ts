import { NextRequest, NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/types';
import {
  getRepoSignals,
  gitHubCacheHeaders,
  gitHubRouteErrorResponse,
} from '@/lib/server/github';
import {
  clientIp,
  getGitHubRateLimiter,
  rateLimitExceededResponse,
} from '@/lib/server/rate-limit';
import { isValidGitHubRepoName, isValidGitHubUsername } from '@/lib/server/validate';

interface RouteContext {
  params: Promise<{ owner: string; repo: string }>;
}

function invalidInput(message: string): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: { code: 'INVALID_INPUT', message, retryAfter: null },
  };
  return NextResponse.json(body, {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { owner, repo } = await context.params;
  if (!isValidGitHubUsername(owner) || !isValidGitHubRepoName(repo)) {
    return invalidInput('Invalid GitHub owner or repo name.');
  }
  const limit = getGitHubRateLimiter().check(clientIp(request));
  if (!limit.allowed) return rateLimitExceededResponse(limit);
  try {
    const envelope = await getRepoSignals(owner, repo);
    return NextResponse.json(envelope, { headers: gitHubCacheHeaders() });
  } catch (error) {
    return gitHubRouteErrorResponse(error);
  }
}
