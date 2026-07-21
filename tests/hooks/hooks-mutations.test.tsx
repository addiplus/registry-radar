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

const EMPTY_LIST: WatchlistResponse = { entries: [], store: 'json' };

const PINNED_ENTRY: WatchlistEntry = {
  name: 'pkg-a',
  pinnedAt: '2026-07-11T02:16:05.226Z',
  note: null,
  noteUpdatedAt: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePinMutation', () => {
  it('applies the optimistic entry before the request resolves', async () => {
    let resolveFetch: ((res: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeTestClient();
    client.setQueryData(qk.watchlist(), EMPTY_LIST);
    const { result } = renderHook(() => usePinMutation(), { wrapper: wrapper(client) });

    act(() => {
      result.current.mutate({ name: 'pkg-a', pinned: false });
    });

    // Cache is updated while the POST is still in flight.
    await waitFor(() => {
      const data = client.getQueryData<WatchlistResponse>(qk.watchlist());
      expect(data?.entries.map((entry) => entry.name)).toEqual(['pkg-a']);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.(jsonResponse(PINNED_ENTRY, 201));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back to the previous cache on rejection', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: { code: 'UPSTREAM', message: 'Watchlist store unavailable. Try again shortly.', retryAfter: null } },
        500,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeTestClient();
    client.setQueryData(qk.watchlist(), EMPTY_LIST);
    const { result } = renderHook(() => usePinMutation(), { wrapper: wrapper(client) });

    await act(async () => {
      await result.current.mutateAsync({ name: 'pkg-a', pinned: false }).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<WatchlistResponse>(qk.watchlist())).toEqual(EMPTY_LIST);
  });
});

describe('useNoteMutation', () => {
  it('applies the optimistic note and invalidates the watchlist key only', async () => {
    let resolveFetch: ((res: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = makeTestClient();
    client.setQueryData(qk.watchlist(), { entries: [PINNED_ENTRY], store: 'json' });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useNoteMutation(), { wrapper: wrapper(client) });

    act(() => {
      result.current.mutate({ name: 'pkg-a', note: 'evaluate for CLI work' });
    });

    // Optimistic note visible mid-flight.
    await waitFor(() => {
      const data = client.getQueryData<WatchlistResponse>(qk.watchlist());
      expect(data?.entries[0]?.note).toBe('evaluate for CLI work');
      expect(data?.entries[0]?.noteUpdatedAt).toBeTruthy();
    });

    const updated: WatchlistEntry = {
      ...PINNED_ENTRY,
      note: 'evaluate for CLI work',
      noteUpdatedAt: '2026-07-11T02:17:00.000Z',
    };
    resolveFetch?.(jsonResponse(updated, 200));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Every invalidation targets the watchlist key and nothing else.
    expect(invalidateSpy).toHaveBeenCalled();
    for (const call of invalidateSpy.mock.calls) {
      expect(call[0]?.queryKey).toEqual(qk.watchlist());
    }
  });
});
