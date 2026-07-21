import { NextRequest, NextResponse } from 'next/server';

import type { ApiErrorBody } from '@/lib/types';
import {
  gitHubCacheHeaders,
  gitHubRouteErrorResponse,
  listUserRepos,
} from '@/lib/server/github';

// GitHub login rules: alphanumeric or single hyphens, no leading or
// trailing hyphen, 1 to 39 characters.
const GITHUB_USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;

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
  if (user === null || !GITHUB_USERNAME_RE.test(user)) {
    return invalidInput('Invalid GitHub username.');
  }
  const pageRaw = searchParams.get('page');
  const page = pageRaw === null ? 1 : Number(pageRaw);
  if (!Number.isInteger(page) || page < 1) {
    return invalidInput('Invalid page number.');
  }
  try {
    const envelope = await listUserRepos(user, page);
    return NextResponse.json(envelope, { headers: gitHubCacheHeaders() });
  } catch (error) {
    return gitHubRouteErrorResponse(error);
  }
}
