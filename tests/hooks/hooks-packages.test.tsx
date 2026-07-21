import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isApiError } from '@/lib/api-error';
import { useScopePackages } from '@/lib/query/hooks';
import type { ScopePackagesResponse } from '@/lib/types';
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useScopePackages', () => {
  it('resolves typed data on 200', async () => {
    const payload: ScopePackagesResponse = {
      scope: '@addiplus',
      packages: [
        {
          name: '@addiplus/pkg-a',
          version: '1.2.3',
          description: 'A package',
          license: 'MIT',
          lastPublishAt: '2026-07-01T00:00:00.000Z',
          weeklyDownloads: 1234,
          repositoryUrl: 'https://github.com/addiplus/pkg-a',
        },
      ],
      total: 1,
      fetchedAt: '2026-07-11T02:16:05.226Z',
    };
    const fetchMock = vi.fn(async () => jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useScopePackages('@addiplus'), {
      wrapper: wrapper(makeTestClient()),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/packages?scope=%40addiplus');
  });

  it('surfaces ApiError code NOT_FOUND on a 404 body', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: { code: 'NOT_FOUND', message: 'Package not found on npm.', retryAfter: null } },
        404,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useScopePackages('@missing'), {
      wrapper: wrapper(makeTestClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error;
    expect(isApiError(error)).toBe(true);
    if (isApiError(error)) {
      expect(error.code).toBe('NOT_FOUND');
      expect(error.status).toBe(404);
    }
  });
});
