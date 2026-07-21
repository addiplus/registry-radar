import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PinButton } from '@/components/pin-button';
import { qk } from '@/lib/query/keys';
import type { WatchlistEntry, WatchlistResponse } from '@/lib/types';
import { makeTestClient, renderWithQueryClient } from '../helpers';

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

describe('PinButton', () => {
  it('flips optimistically on the first click and stays disabled while the mutation is pending', async () => {
    let resolvePost: ((res: Response) => void) | undefined;
    const postPromise = new Promise<Response>((resolve) => {
      resolvePost = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return postPromise;
      // Watchlist GET (mount query and post-settle invalidation refetch).
      return Promise.resolve(jsonResponse(EMPTY_LIST));
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = makeTestClient();
    client.setQueryData(qk.watchlist(), EMPTY_LIST);
    renderWithQueryClient(<PinButton name="pkg-a" />, client);

    const button = screen.getByRole('button', { name: 'Pin' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);

    // Optimistic toggle is instant even though the POST is still in flight,
    // and the button is disabled for the whole pending window so a second
    // click cannot race another request against this one.
    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Pinned' })).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A click while pending is a no-op: still exactly one request in flight.
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolvePost?.(jsonResponse(PINNED_ENTRY, 201));
    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });
  });
});
