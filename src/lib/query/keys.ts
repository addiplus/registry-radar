import type { DownloadDays } from '@/lib/types';

// Typed query key factory. Every cache entry in the app hangs off qk.all ('rr'),
// which lets the global refresh predicate select everything except the watchlist.
export const qk = {
  all: ['rr'] as const,
  packages: (scope: string) => [...qk.all, 'packages', scope] as const,
  packageMeta: (name: string) => [...qk.all, 'packageMeta', name] as const,
  downloads: (name: string, days: DownloadDays) => [...qk.all, 'downloads', name, days] as const,
  versions: (name: string) => [...qk.all, 'versions', name] as const,
  repos: (user: string) => [...qk.all, 'repos', user] as const,
  repoSignals: (owner: string, repo: string) => [...qk.all, 'repoSignals', owner, repo] as const,
  watchlist: () => [...qk.all, 'watchlist'] as const,
};
