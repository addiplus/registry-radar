import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME, VERSIONS_PAGE_SIZE } from '@/lib/constants';
import type { DownloadDays, RepoRef } from '@/lib/types';
import {
  fetchDownloads,
  fetchPackageMeta,
  fetchRepoListPage,
  fetchRepoSignals,
  fetchScopePackages,
  fetchVersionPage,
  fetchWatchlist,
} from './fetchers';
import { qk } from './keys';

export function useScopePackages(scope: string) {
  return useQuery({
    queryKey: qk.packages(scope),
    queryFn: () => fetchScopePackages(scope),
    staleTime: STALE_TIME.packages,
  });
}

export function usePackageMeta(name: string) {
  return useQuery({
    queryKey: qk.packageMeta(name),
    queryFn: () => fetchPackageMeta(name),
    staleTime: STALE_TIME.packageMeta,
  });
}

export function useDownloads(name: string, days: DownloadDays) {
  return useQuery({
    queryKey: qk.downloads(name, days),
    queryFn: () => fetchDownloads(name, days),
    staleTime: STALE_TIME.downloads,
  });
}

// Honest server pagination: pages are offset/limit slices of the packument,
// nextOffset null marks the last page.
export function useVersionHistory(name: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: qk.versions(name),
    queryFn: ({ pageParam }) => fetchVersionPage(name, pageParam, VERSIONS_PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset ?? undefined,
    staleTime: STALE_TIME.packageMeta,
    enabled,
  });
}

// GitHub repo list: cursor is a 1-based page number, pages keep the envelope
// so rateLimit stays attached to each page.
export function useRepoList(user: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: qk.repos(user),
    queryFn: ({ pageParam }) => fetchRepoListPage(user, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.data.nextPage ?? undefined,
    staleTime: STALE_TIME.repos,
    enabled,
  });
}

// Dependent query: fires only once packageMeta has produced a GitHub repo ref.
export function useRepoSignals(repoRef: RepoRef | null | undefined) {
  return useQuery({
    queryKey: qk.repoSignals(repoRef?.owner ?? '', repoRef?.repo ?? ''),
    queryFn: () => fetchRepoSignals(repoRef?.owner ?? '', repoRef?.repo ?? ''),
    staleTime: STALE_TIME.repoSignals,
    enabled: !!repoRef,
  });
}

export function useWatchlist() {
  return useQuery({
    queryKey: qk.watchlist(),
    queryFn: fetchWatchlist,
    staleTime: STALE_TIME.watchlist,
  });
}

// Hover prefetch for the detail drawer: versions page 0 only. Meta and the
// 30 day downloads series are already hot in the cache from the card.
export function usePrefetchPackageDetail(name: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.prefetchInfiniteQuery({
      queryKey: qk.versions(name),
      queryFn: ({ pageParam }) => fetchVersionPage(name, pageParam, VERSIONS_PAGE_SIZE),
      initialPageParam: 0,
      staleTime: STALE_TIME.packageMeta,
    });
  };
}

// Global refresh, selective: every 'rr' query except the local watchlist store.
export function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === 'rr' && query.queryKey[1] !== 'watchlist',
    });
}
