import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePackageMeta, useRepoSignals } from '@/lib/query/hooks';
import { qk } from '@/lib/query/keys';
import type { GitHubEnvelope, PackageMeta, RepoSignals } from '@/lib/types';
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

const META_NO_REPO: PackageMeta = {
  name: 'pkg-a',
  description: 'A package',
  latestVersion: '1.0.0',
  license: 'MIT',
  createdAt: null,
  lastPublishAt: null,
  repo: null,
  isMcp: false,
  mcpRegistryName: null,
  hasCliBin: false,
  dependencyCount: 0,
  unpackedSize: null,
  versionCount: 1,
};

const META_WITH_REPO: PackageMeta = {
  ...META_NO_REPO,
  repo: {
    owner: 'addiplus',
    repo: 'pkg-a',
    url: 'https://github.com/addiplus/pkg-a',
    directory: null,
  },
};

const SIGNALS_ENVELOPE: GitHubEnvelope<RepoSignals> = {
  data: {
    name: 'pkg-a',
    fullName: 'addiplus/pkg-a',
    description: 'A package',
    url: 'https://github.com/addiplus/pkg-a',
    stars: 42,
    forks: 3,
    openIssuePrCount: 5,
    language: 'TypeScript',
    licenseSpdx: 'MIT',
    defaultBranch: 'main',
    lastPushAt: '2026-07-10T00:00:00.000Z',
    archived: false,
    ci: { kind: 'none' },
  },
  rateLimit: { remaining: 59, resetAt: 1752200000000 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRepoSignals dependent query', () => {
  it('stays disabled while meta has repo null, fires when repo appears', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/signals')) return jsonResponse(SIGNALS_ENVELOPE);
      if (url.includes('/meta')) return jsonResponse(META_NO_REPO);
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = makeTestClient();
    const { result } = renderHook(
      () => {
        const meta = usePackageMeta('pkg-a');
        const signals = useRepoSignals(meta.data?.repo);
        return { meta, signals };
      },
      { wrapper: wrapper(client) },
    );

    // Meta resolves with repo: null; the dependent query never fires.
    await waitFor(() => expect(result.current.meta.isSuccess).toBe(true));
    expect(result.current.signals.fetchStatus).toBe('idle');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('/signals');

    // Repo appears (e.g. fresh meta data); the dependent query enables and fetches.
    act(() => {
      client.setQueryData(qk.packageMeta('pkg-a'), META_WITH_REPO);
    });
    await waitFor(() => expect(result.current.signals.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/github/repo/addiplus/pkg-a/signals');
    expect(result.current.signals.data?.fullName).toBe('addiplus/pkg-a');
  });
});
