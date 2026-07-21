// Shared type contracts for Registry Radar (build plan section 2).
// Every route handler, query hook, and component consumes these shapes.

// Shared primitives
export type ISODateTime = string; // e.g. 2026-07-11T02:16:05.226Z
export type DayStamp = string; // YYYY-MM-DD, UTC

export interface RepoRef {
  owner: string;
  repo: string;
  url: string; // https://github.com/owner/repo
  directory: string | null; // monorepo subpath, else null
}

// Scope listing (search-derived)
export interface PackageSummary {
  name: string;
  version: string;
  description: string | null;
  license: string | null;
  lastPublishAt: ISODateTime | null;
  weeklyDownloads: number; // free in search payload, coerced with Number()
  repositoryUrl: string | null; // raw, un-normalized
}
export interface ScopePackagesResponse {
  scope: string; // e.g. "@addiplus"
  packages: PackageSummary[];
  total: number; // matches after prefix filter
  fetchedAt: ISODateTime;
}

// Downloads
export interface DownloadPoint {
  day: DayStamp;
  downloads: number;
}
export type DownloadDays = 7 | 30 | 90;
export interface DownloadSeries {
  packageName: string;
  days: DownloadDays;
  start: DayStamp; // API-returned, never the requested value
  end: DayStamp;
  total: number;
  points: DownloadPoint[]; // chronological, zero-filled by npm
}

// Packument-derived package metadata (drawer header + card facts)
export interface PackageMeta {
  name: string;
  description: string | null;
  latestVersion: string;
  license: string | null; // read from the latest version object
  createdAt: ISODateTime | null;
  lastPublishAt: ISODateTime | null; // time[latest]
  repo: RepoRef | null; // null when non-GitHub or absent
  isMcp: boolean; // section 7 rules
  mcpRegistryName: string | null; // mcpName field when present
  hasCliBin: boolean;
  dependencyCount: number; // latest version, prod deps only
  unpackedSize: number | null; // latest version dist.unpackedSize, bytes
  versionCount: number;
}

// Honest server pagination for version history
export interface VersionEntry {
  version: string;
  publishedAt: ISODateTime | null;
  license: string | null;
  dependencyCount: number;
  devDependencyCount: number;
  unpackedSize: number | null;
  fileCount: number | null;
  hasBin: boolean;
  enginesNode: string | null;
}
export interface VersionPage {
  items: VersionEntry[];
  total: number;
  nextOffset: number | null; // null on last page
}

// GitHub
export type CiStatus =
  | { kind: 'none' } // total_count === 0
  | { kind: 'running'; url: string | null } // status !== 'completed'
  | { kind: 'completed'; conclusion: string; url: string | null; at: ISODateTime | null };

export interface RepoSummary {
  name: string;
  fullName: string; // owner/repo
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  openIssuePrCount: number; // includes PRs, labeled as such in UI
  language: string | null;
  licenseSpdx: string | null; // may be "NOASSERTION"
  defaultBranch: string;
  lastPushAt: ISODateTime | null; // pushed_at, any branch
  archived: boolean;
}
export interface RepoListPage {
  items: RepoSummary[];
  nextPage: number | null;
}
export interface RepoSignals extends RepoSummary {
  ci: CiStatus;
}

export interface RateLimitInfo {
  remaining: number | null;
  resetAt: number | null; // epoch ms (header seconds * 1000)
}
export interface GitHubEnvelope<T> {
  data: T;
  rateLimit: RateLimitInfo;
}

// Watchlist
export interface WatchlistEntry {
  name: string; // npm package name, primary key
  pinnedAt: ISODateTime;
  note: string | null;
  noteUpdatedAt: ISODateTime | null;
}
export type StoreKind = 'redis' | 'json' | 'ephemeral';
export interface WatchlistResponse {
  entries: WatchlistEntry[];
  store: StoreKind;
}

// Error contract (every route handler error body)
export type ApiErrorCode =
  | 'NOT_FOUND' // upstream 404 (npm package, GitHub user/repo)
  | 'RATE_LIMITED' // GitHub 403 with X-RateLimit-Remaining: 0
  | 'SECONDARY_LIMIT' // GitHub 403 with Retry-After
  | 'BAD_REQUEST' // upstream 400 (unexpected; we control params)
  | 'INVALID_INPUT' // our own 400 (bad scope, offset, note length)
  | 'UPSTREAM'; // 5xx or network failure
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string; // neutral product copy, no dashes
    retryAfter: number | null; // epoch ms when retry is allowed, else null
  };
}

// Watchlist view model row (client-computed join, used by watchlist view + markdown export)
export interface WatchlistRow {
  entry: WatchlistEntry;
  meta: PackageMeta | null;
  weeklyDownloads: number | null;
  momentum: number | null; // sum(last 7d) minus sum(previous 7d)
}
