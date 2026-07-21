import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNoteMutation, usePinMutation } from '@/lib/query/mutations';
import { qk } from '@/lib/query/keys';
import type { WatchlistEntry, WatchlistResponse } from '@/lib/types';
import { makeTestClient } from '../helpers';

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const PINNED_ENTRY: WatchlistEntry = {
  name: 'pkg-a',
  pinnedAt: '2026-07-11T02:16:05.226Z',
  note: null,
  noteUpdatedAt: null,
};

// Server state before either mutation: pkg-a pinned, no note.
const S0: WatchlistResponse = { entries: [PINNED_ENTRY], store: 'json' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('overlapping watchlist mutations', () => {
  it('skips the stale rollback when an older mutation fails after a newer one started', async () => {
    const putRequest = deferred<Response>();
    const deleteRequest = deferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'PUT') return putRequest.promise;
      if (method === 'DELETE') return deleteRequest.promise;
      return Promise.resolve(jsonResponse(S0));
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = makeTestClient();
    client.setQueryData(qk.watchlist(), S0);
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const note = renderHook(() => useNoteMutation(), { wrapper: wrapper(client) });
    const pin = renderHook(() => usePinMutation(), { wrapper: wrapper(client) });

    // Older mutation: save a note (optimistic S0 -> S1).
    act(() => {
      note.result.current.mutate({ name: 'pkg-a', note: 'evaluate for CLI work' });
    });
    await waitFor(() => {
      const data = client.getQueryData<WatchlistResponse>(qk.watchlist());
      expect(data?.entries[0]?.note).toBe('evaluate for CLI work');
    });

    // Newer mutation while the note PUT is in flight: unpin (S1 -> S2).
    act(() => {
      pin.result.current.mutate({ name: 'pkg-a', pinned: true });
    });
    await waitFor(() => {
      expect(client.getQueryData<WatchlistResponse>(qk.watchlist())?.entries).toEqual([]);
    });

    // The older mutation fails. Its rollback must NOT restore S0 and
    // resurrect the just-unpinned entry; the cache keeps the newer
    // optimistic value.
    putRequest.resolve(
      jsonResponse(
        { error: { code: 'UPSTREAM', message: 'Watchlist store unavailable. Try again shortly.', retryAfter: null } },
        500,
      ),
    );
    await waitFor(() => expect(note.result.current.isError).toBe(true));
    expect(client.getQueryData<WatchlistResponse>(qk.watchlist())?.entries).toEqual([]);

    // The failed mutation still invalidated the watchlist key on settle.
    expect(invalidateSpy).toHaveBeenCalled();
    for (const call of invalidateSpy.mock.calls) {
      expect(call[0]?.queryKey).toEqual(qk.watchlist());
    }

    // The surviving unpin resolves; the cache converges to the newer value.
    deleteRequest.resolve(jsonResponse({}, 200));
    await waitFor(() => expect(pin.result.current.isSuccess).toBe(true));
    expect(client.getQueryData<WatchlistResponse>(qk.watchlist())?.entries).toEqual([]);
  });

  it('still rolls back a single mutation whose version is the latest for the key', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: { code: 'UPSTREAM', message: 'Watchlist store unavailable. Try again shortly.', retryAfter: null } },
        500,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeTestClient();
    client.setQueryData(qk.watchlist(), S0);
    const { result } = renderHook(() => useNoteMutation(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current
        .mutateAsync({ name: 'pkg-a', note: 'evaluate for CLI work' })
        .catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<WatchlistResponse>(qk.watchlist())).toEqual(S0);
  });
});
