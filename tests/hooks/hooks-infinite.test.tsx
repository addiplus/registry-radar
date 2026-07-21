import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVersionHistory } from '@/lib/query/hooks';
import type { VersionEntry, VersionPage } from '@/lib/types';
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

function entry(version: string): VersionEntry {
  return {
    version,
    publishedAt: '2026-07-01T00:00:00.000Z',
    license: 'MIT',
    dependencyCount: 1,
    devDependencyCount: 2,
    unpackedSize: 1000,
    fileCount: 5,
    hasBin: false,
    enginesNode: '>=20',
  };
}

const PAGE_0: VersionPage = { items: [entry('2.0.0'), entry('1.1.0')], total: 3, nextOffset: 2 };
const PAGE_1: VersionPage = { items: [entry('1.0.0')], total: 3, nextOffset: null };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useVersionHistory', () => {
  it('fetches page 0, fetchNextPage follows nextOffset, stops at null', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('offset=0')) return jsonResponse(PAGE_0);
      if (url.includes('offset=2')) return jsonResponse(PAGE_1);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVersionHistory('pkg-a', true), {
      wrapper: wrapper(makeTestClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]).toEqual(PAGE_0);
    expect(result.current.hasNextPage).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/package/versions/pkg-a?offset=0&limit=20');

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages[1]).toEqual(PAGE_1);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/package/versions/pkg-a?offset=2&limit=20');

    // nextOffset null on the last page: no further page is offered.
    expect(result.current.hasNextPage).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stays idle while disabled', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(PAGE_0));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useVersionHistory('pkg-a', false), {
      wrapper: wrapper(makeTestClient()),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
