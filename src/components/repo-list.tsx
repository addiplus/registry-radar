'use client';

import { isApiError } from '@/lib/api-error';
import { useRepoList, useRepoSignals } from '@/lib/query/hooks';
import type { RepoSummary } from '@/lib/types';
import { CiBadge } from './ci-badge';
import { RowSkeleton } from './skeleton';
import { EmptyState, ErrorState } from './states';

const countFormat = new Intl.NumberFormat('en-US');

function formatCount(n: number): string {
  return countFormat.format(n);
}

// GitHub repo list for the configured user. Infinite query with a Load more
// button; a failed next page keeps the loaded pages and offers an inline
// retry instead of replacing the list.
export function RepoList({ user }: { user: string }) {
  const repos = useRepoList(user, user.trim() !== '');

  if (repos.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading repositories">
        {Array.from({ length: 5 }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (repos.isError && repos.data === undefined) {
    return (
      <ErrorState
        message={isApiError(repos.error) ? repos.error.message : 'Could not load repositories.'}
        onRetry={() => void repos.refetch()}
      />
    );
  }

  const items = repos.data?.pages.flatMap((page) => page.data.items) ?? [];

  if (items.length === 0) {
    return <EmptyState message={`No public repos for ${user}.`} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {items.map((repo) => (
          <RepoRow key={repo.fullName} repo={repo} />
        ))}
      </ul>

      {repos.isError && (
        <ErrorState
          message={isApiError(repos.error) ? repos.error.message : 'Could not load more repositories.'}
          onRetry={() => {
            if (repos.hasNextPage) {
              void repos.fetchNextPage();
            } else {
              void repos.refetch();
            }
          }}
        />
      )}

      {repos.hasNextPage && (
        <button
          type="button"
          onClick={() => void repos.fetchNextPage()}
          disabled={repos.isFetchingNextPage}
          className="self-center rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {repos.isFetchingNextPage ? 'Loading...' : 'Load more'}
        </button>
      )}
    </div>
  );
}

// One repo row. The CI badge comes from a per-row signals query (the list
// payload carries no CI field); while signals load or fail the badge slot
// stays empty and the global rate-limit banner covers error messaging.
function RepoRow({ repo }: { repo: RepoSummary }) {
  const signals = useRepoSignals({
    owner: repo.fullName.split('/')[0],
    repo: repo.name,
    url: repo.url,
    directory: null,
  });

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-3">
        <a
          href={repo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate font-mono text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
        >
          {repo.fullName}
        </a>
        <span className="flex shrink-0 items-center gap-2">
          {repo.archived && (
            <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              archived
            </span>
          )}
          {signals.data !== undefined && <CiBadge ci={signals.data.ci} />}
        </span>
      </div>

      {repo.description !== null && (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{repo.description}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>{formatCount(repo.stars)} stars</span>
        <span>{formatCount(repo.forks)} forks</span>
        <span>{formatCount(repo.openIssuePrCount)} open issues + PRs</span>
        {repo.language !== null && <span>{repo.language}</span>}
        {repo.licenseSpdx !== null && <span>{repo.licenseSpdx}</span>}
        {repo.lastPushAt !== null && <span>last push {repo.lastPushAt.slice(0, 10)}</span>}
      </div>
    </li>
  );
}
