export const DEFAULT_NPM_SCOPE = '@addiplus';
export const DEFAULT_GITHUB_USER = 'addiplus';
export const STALE_TIME = {
  downloads: 60 * 60 * 1000, // 1h: npm stats lag 1 to 2 days, hourly is generous
  packageMeta: 30 * 60 * 1000, // 30min: changes only on publish
  packages: 30 * 60 * 1000, // scope listing
  repoSignals: 5 * 60 * 1000, // 5min: stars/CI move often, budget is 60/hr
  repos: 5 * 60 * 1000,
  watchlist: 30 * 1000, // local store, keep snappy
} as const;
export const GC_TIME = 30 * 60 * 1000;
export const NOTE_MAX_LENGTH = 280;
export const VERSIONS_PAGE_SIZE = 20;
export const SSR_PREFETCH_PACKAGE_CAP = 24; // prefetch meta + 30d series for at most N packages
