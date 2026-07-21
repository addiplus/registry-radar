import type { CiStatus, RepoSignals, RepoSummary } from '../types';

// Minimal shapes for the GitHub REST payloads this app consumes.
// Only the fields actually read are declared.
export interface GitHubRepoDto {
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

export interface GitHubWorkflowRunDto {
  status: string | null;
  conclusion: string | null;
  html_url: string | null;
  updated_at: string | null;
}

export interface GitHubWorkflowRunsDto {
  total_count: number;
  workflow_runs: GitHubWorkflowRunDto[];
}

// open_issues_count includes pull requests; the honest field name
// openIssuePrCount carries that fact into the UI (plan section 1).
export function toRepoSummary(dto: GitHubRepoDto): RepoSummary {
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

// CI badge mapping (plan section 3): the runs query is already filtered
// to the default branch, so the latest run answers "is the default
// branch green?".
export function toCiStatus(dto: GitHubWorkflowRunsDto): CiStatus {
  if (dto.total_count === 0) return { kind: 'none' };
  const run = dto.workflow_runs[0];
  if (run === undefined) return { kind: 'none' };
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

export function toRepoSignals(
  repo: GitHubRepoDto,
  runs: GitHubWorkflowRunsDto,
): RepoSignals {
  return { ...toRepoSummary(repo), ci: toCiStatus(runs) };
}

// User listing filter (plan section 3): no forks, and drop the profile
// readme repo ({user}) and the pages repo ({user}.github.io),
// case-insensitive.
export function filterUserRepos(repos: GitHubRepoDto[], user: string): GitHubRepoDto[] {
  const lowered = user.toLowerCase();
  return repos
    .filter((dto) => dto.fork === false)
    .filter((dto) => {
      const name = dto.name.toLowerCase();
      return name !== lowered && name !== `${lowered}.github.io`;
    });
}
