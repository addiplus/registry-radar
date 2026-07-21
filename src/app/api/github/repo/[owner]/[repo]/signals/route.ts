import { NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/types';
import {
  getRepoSignals,
  gitHubCacheHeaders,
  gitHubRouteErrorResponse,
} from '@/lib/server/github';

// Same rules as the repos route for owner; repo names allow dots and
// underscores on top of alphanumerics and hyphens.
const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

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

export async function GET(_request: Request, context: RouteContext) {
  const { owner, repo } = await context.params;
  if (!GITHUB_USERNAME_RE.test(owner) || !GITHUB_REPO_RE.test(repo)) {
    return invalidInput('Invalid GitHub owner or repo name.');
  }
  try {
    const envelope = await getRepoSignals(owner, repo);
    return NextResponse.json(envelope, { headers: gitHubCacheHeaders() });
  } catch (error) {
    return gitHubRouteErrorResponse(error);
  }
}
