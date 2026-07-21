import { NextResponse } from 'next/server';
import { ApiError, isApiError } from '@/lib/api-error';
import {
  isValidNpmName,
  readBoundedJsonBody,
  WATCHLIST_MAX_ENTRIES,
} from '@/lib/server/validate';
import { getWatchlistStore } from '@/lib/store';
import type { ApiErrorBody, WatchlistEntry, WatchlistResponse } from '@/lib/types';

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
    const payload = await readBoundedJsonBody(request);
    const rawName =
      typeof payload === 'object' && payload !== null
        ? (payload as { name?: unknown }).name
        : undefined;
    const name = typeof rawName === 'string' ? rawName.trim() : '';
    if (!isValidNpmName(name)) {
      throw new ApiError('INVALID_INPUT', 'Enter a valid npm package name.', 400);
    }
    const store = getWatchlistStore();
    const entries = await store.list();
    const existing = entries.find((entry) => entry.name === name);
    // Hard cap on the shared unauthenticated list (security fix G1). Re-pin of
    // an existing name stays allowed so retries remain idempotent.
    if (!existing && entries.length >= WATCHLIST_MAX_ENTRIES) {
      throw new ApiError(
        'INVALID_INPUT',
        `Watchlist is full (${WATCHLIST_MAX_ENTRIES} entries). Unpin a package first.`,
        409,
      );
    }
    const entry = await store.pin(name);
    // Re-pin of an existing name returns 200 with the existing entry (idempotent
    // for optimistic retry); a fresh pin returns 201.
    return NextResponse.json(entry, { status: existing ? 200 : 201 });
  } catch (error) {
    return handleError(error);
  }
}
