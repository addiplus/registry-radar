import { ApiError } from '@/lib/api-error';
import type {
  ApiErrorBody,
  DownloadDays,
  DownloadSeries,
  GitHubEnvelope,
  PackageMeta,
  RepoListPage,
  RepoSignals,
  ScopePackagesResponse,
  VersionPage,
  WatchlistEntry,
  WatchlistResponse,
} from '@/lib/types';
import { reportRateLimit } from './rate-limit';

// Browser-side fetch wrappers, one per route. Non-OK responses throw ApiError
// parsed from the uniform ApiErrorBody contract. GitHub wrappers also report
// rate-limit headers on success and on 403 before throwing.

async function toApiError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return new ApiError(body.error.code, body.error.message, res.status, body.error.retryAfter);
  } catch {
    return new ApiError('UPSTREAM', `Request failed with status ${res.status}.`, res.status, null);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = init === undefined ? await fetch(url) : await fetch(url, init);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

async function gitHubRequest<T>(url: string): Promise<GitHubEnvelope<T>> {
  const res = await fetch(url);
  if (!res.ok) {
    const error = await toApiError(res);
    if (error.status === 403) {
      reportRateLimit({ remaining: 0, resetAt: error.retryAfter });
    }
    throw error;
  }
  const envelope = (await res.json()) as GitHubEnvelope<T>;
  reportRateLimit(envelope.rateLimit);
  return envelope;
}

const JSON_INIT = {
  headers: { 'Content-Type': 'application/json' },
} as const;

// npm routes (Module B)

export function fetchScopePackages(scope: string): Promise<ScopePackagesResponse> {
  return request(`/api/packages?scope=${encodeURIComponent(scope)}`);
}

export function fetchPackageMeta(name: string): Promise<PackageMeta> {
  return request(`/api/package/meta/${encodeURIComponent(name)}`);
}

export function fetchVersionPage(name: string, offset: number, limit: number): Promise<VersionPage> {
  return request(`/api/package/versions/${encodeURIComponent(name)}?offset=${offset}&limit=${limit}`);
}

export function fetchDownloads(name: string, days: DownloadDays): Promise<DownloadSeries> {
  return request(`/api/package/downloads/${encodeURIComponent(name)}?range=${days}`);
}

// GitHub routes (Module C)

export function fetchRepoListPage(user: string, page: number): Promise<GitHubEnvelope<RepoListPage>> {
  return gitHubRequest(`/api/github/repos?user=${encodeURIComponent(user)}&page=${page}`);
}

export async function fetchRepoSignals(owner: string, repo: string): Promise<RepoSignals> {
  const envelope = await gitHubRequest<RepoSignals>(
    `/api/github/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/signals`,
  );
  return envelope.data;
}

// Watchlist routes (Module D)

export function fetchWatchlist(): Promise<WatchlistResponse> {
  return request('/api/watchlist');
}

export function pinPackage(name: string): Promise<WatchlistEntry> {
  return request('/api/watchlist', {
    method: 'POST',
    ...JSON_INIT,
    body: JSON.stringify({ name }),
  });
}

export async function unpinPackage(name: string): Promise<void> {
  const res = await fetch(`/api/watchlist/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) throw await toApiError(res);
}

export function setWatchlistNote(name: string, note: string): Promise<WatchlistEntry> {
  return request(`/api/watchlist/${encodeURIComponent(name)}`, {
    method: 'PUT',
    ...JSON_INIT,
    body: JSON.stringify({ note }),
  });
}
