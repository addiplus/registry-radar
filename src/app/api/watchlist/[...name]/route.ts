import { NextResponse } from 'next/server';
import { ApiError, isApiError } from '@/lib/api-error';
import { readBoundedJsonBody, WATCHLIST_NOTE_MAX_CHARS } from '@/lib/server/validate';
import { getWatchlistStore } from '@/lib/store';
import type { ApiErrorBody, WatchlistEntry } from '@/lib/types';

interface RouteContext {
  params: Promise<{ name: string[] }>;
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

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { name } = await context.params;
    const packageName = name.join('/');
    // Idempotent: deleting a missing name is also a 204.
    await getWatchlistStore().unpin(packageName);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<WatchlistEntry | ApiErrorBody>> {
  try {
    const { name } = await context.params;
    const packageName = name.join('/');
    const payload = await readBoundedJsonBody(request);
    const rawNote =
      typeof payload === 'object' && payload !== null
        ? (payload as { note?: unknown }).note
        : undefined;
    if (typeof rawNote !== 'string') {
      throw new ApiError('INVALID_INPUT', 'Note must be a string.', 400);
    }
    const note = rawNote.trim();
    if (note.length > WATCHLIST_NOTE_MAX_CHARS) {
      throw new ApiError(
        'INVALID_INPUT',
        `Note must be ${WATCHLIST_NOTE_MAX_CHARS} characters or fewer.`,
        400,
      );
    }
    // Empty string clears the note to null.
    const entry = await getWatchlistStore().setNote(packageName, note === '' ? null : note);
    if (!entry) {
      throw new ApiError('NOT_FOUND', 'Pin the package before adding a note.', 404);
    }
    return NextResponse.json(entry, { status: 200 });
  } catch (error) {
    return handleError(error);
  }
}
