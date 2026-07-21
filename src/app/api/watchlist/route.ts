import { NextResponse } from 'next/server';
import { ApiError, isApiError } from '@/lib/api-error';
import { getWatchlistStore } from '@/lib/store';
import type { ApiErrorBody, WatchlistEntry, WatchlistResponse } from '@/lib/types';

const NPM_NAME_PATTERN = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
const NPM_NAME_MAX_LENGTH = 214;

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function handleError(error: unknown): NextResponse<ApiErrorBody> {
  if (isApiError(error)) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, retryAfter: error.retryAfter },
    };
    return NextResponse.json(body, { status: error.status });
  }
  const body: ApiErrorBody = {
    error: {
      code: 'UPSTREAM',
      message: 'Watchlist store unavailable. Try again shortly.',
      retryAfter: null,
    },
  };
  return NextResponse.json(body, { status: 500 });
}

export async function GET(): Promise<NextResponse<WatchlistResponse | ApiErrorBody>> {
  try {
    const store = getWatchlistStore();
    const entries = await store.list();
    entries.sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
    const body: WatchlistResponse = { entries, store: store.kind() };
    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse<WatchlistEntry | ApiErrorBody>> {
  try {
    const payload = await readJsonBody(request);
    const rawName =
      typeof payload === 'object' && payload !== null
        ? (payload as { name?: unknown }).name
        : undefined;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (name.length === 0 || name.length > NPM_NAME_MAX_LENGTH || !NPM_NAME_PATTERN.test(name)) {
      throw new ApiError('INVALID_INPUT', 'Enter a valid npm package name.', 400);
    }
    const store = getWatchlistStore();
    const existing = (await store.list()).find((entry) => entry.name === name);
    const entry = await store.pin(name);
    // Re-pin of an existing name returns 200 with the existing entry (idempotent
    // for optimistic retry); a fresh pin returns 201.
    return NextResponse.json(entry, { status: existing ? 200 : 201 });
  } catch (error) {
    return handleError(error);
  }
}
