import { NextResponse } from 'next/server';

import { ApiError, isApiError } from '@/lib/api-error';
import { gitHubError } from '@/lib/transforms/errors';
import type {
  ApiErrorBody,
  CiStatus,
  GitHubEnvelope,
  RateLimitInfo,
  RepoListPage,
  RepoSignals,
  RepoSummary,
} from '@/lib/types';

const GITHUB_API_BASE = 'https://api.github.com';
const REVALIDATE_SECONDS = 300;

// Minimal shapes for the GitHub REST payloads this app consumes.
// Only the fields actually read are declared.
interface GitHubRepoDto {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  license: { spdx_id: string | null } | null;
  default_branch: string;
  pushed_at: string | null;
  archived: boolean;
  fork: boolean;
}

interface GitHubWorkflowRunDto {
  status: string | null;
  conclusion: string | null;
  html_url: string | null;
  updated_at: string | null;
}

interface GitHubWorkflowRunsDto {
  total_count: number;
  workflow_runs: GitHubWorkflowRunDto[];
}

interface GitHubFetchResult<T> {
  data: T;
  rateLimit: RateLimitInfo;
  headers: Headers;
}

function readRateLimit(headers: Headers): RateLimitInfo {
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const parsedRemaining = remaining === null ? NaN : Number(remaining);
  const parsedReset = reset === null ? NaN : Number(reset);
  return {
    remaining: Number.isFinite(parsedRemaining) ? parsedRemaining : null,
    resetAt: Number.isFinite(parsedReset) ? parsedReset * 1000 : null,
  };
}

// Status passthrough per build plan section 3:
// upstream 404 to our 404, GitHub 403 to our 403, everything else (5xx,
// unexpected 400, bad token 401) to 502.
function statusForUpstream(status: number): number {
  if (status === 404) return 404;
  if (status === 403) return 403;
  return 502;
}

export async function gitHubFetch<T>(
  path: string,
  revalidate: number = REVALIDATE_SECONDS,
): Promise<GitHubFetchResult<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'registry-radar',
  };
  // Escape hatch: authenticated requests get 5000/hr instead of 60/hr.
  // Read from env only; never logged, never baked into responses.
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${GITHUB_API_BASE}${path}`, {
      headers,
      next: { revalidate },
    });
  } catch {
    throw new ApiError('UPSTREAM', 'GitHub API request failed. Try again shortly.', 502);
  }

  const rateLimit = readRateLimit(res.headers);

  if (!res.ok) {
    // Error code, message, and retryAfter come from the shared Module A
    // mapping helper so the contract lives in exactly one place.
    const body = gitHubError(res.status, res.headers);
    throw new ApiError(
      body.error.code,
      body.error.message,
      statusForUpstream(res.status),
      body.error.retryAfter,
    );
  }

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    throw new ApiError(
      'UPSTREAM',
      'GitHub API returned an unreadable response. Try again shortly.',
      502,
    );
  }

  return { data, rateLimit, headers: res.headers };
}

function toRepoSummary(dto: GitHubRepoDto): RepoSummary {
  return {
    name: dto.name,
    fullName: dto.full_name,
    description: dto.description ?? null,
    url: dto.html_url,
    stars: dto.stargazers_count,
    forks: dto.forks_count,
    openIssuePrCount: dto.open_issues_count,
    language: dto.language ?? null,
    licenseSpdx: dto.license?.spdx_id ?? null,
    defaultBranch: dto.default_branch,
    lastPushAt: dto.pushed_at ?? null,
    archived: dto.archived,
  };
}

function toCiStatus(dto: GitHubWorkflowRunsDto): CiStatus {
  if (dto.total_count === 0) return { kind: 'none' };
  const run = dto.workflow_runs[0];
  if (!run) return { kind: 'none' };
  if (run.status !== 'completed') {
    return { kind: 'running', url: run.html_url ?? null };
  }
  return {
    kind: 'completed',
    conclusion: run.conclusion ?? 'unknown',
    url: run.html_url ?? null,
    at: run.updated_at ?? null,
  };
}

export async function listUserRepos(
  user: string,
  page: number,
): Promise<GitHubEnvelope<RepoListPage>> {
  const result = await gitHubFetch<GitHubRepoDto[]>(
    `/users/${encodeURIComponent(user)}/repos?per_page=100&type=owner&sort=updated&page=${page}`,
  );
  const lowered = user.toLowerCase();
  const items = result.data
    .filter((dto) => dto.fork === false)
    .filter((dto) => {
      const name = dto.name.toLowerCase();
      return name !== lowered && name !== `${lowered}.github.io`;
    })
    .map(toRepoSummary);
  const link = result.headers.get('link');
  const nextPage = link !== null && link.includes('rel="next"') ? page + 1 : null;
  return { data: { items, nextPage }, rateLimit: result.rateLimit };
}

export async function getRepoSignals(
  owner: string,
  repo: string,
): Promise<GitHubEnvelope<RepoSignals>> {
  const safeOwner = encodeURIComponent(owner);
  const safeRepo = encodeURIComponent(repo);
  const repoResult = await gitHubFetch<GitHubRepoDto>(`/repos/${safeOwner}/${safeRepo}`);
  const summary = toRepoSummary(repoResult.data);
  // Branch-filtered: the badge answers "is the default branch green?",
  // not "did any PR branch run CI lately?".
  const runsResult = await gitHubFetch<GitHubWorkflowRunsDto>(
    `/repos/${safeOwner}/${safeRepo}/actions/runs?branch=${encodeURIComponent(summary.defaultBranch)}&per_page=1`,
  );
  return {
    data: { ...summary, ci: toCiStatus(runsResult.data) },
    rateLimit: runsResult.rateLimit,
  };
}

// Shared catch-block for both GitHub route handlers: ApiError to its
// ApiErrorBody plus matching status, anything else to a neutral 502.
export function gitHubRouteErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  const headers = { 'Cache-Control': 'no-store' };
  if (isApiError(error)) {
    const body: ApiErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        retryAfter: error.retryAfter,
      },
    };
    return NextResponse.json(body, { status: error.status, headers });
  }
  const body: ApiErrorBody = {
    error: {
      code: 'UPSTREAM',
      message: 'GitHub data unavailable. Try again shortly.',
      retryAfter: null,
    },
  };
  return NextResponse.json(body, { status: 502, headers });
}

export function gitHubCacheHeaders(): Record<string, string> {
  return {
    'Cache-Control': `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS * 2}`,
  };
}
