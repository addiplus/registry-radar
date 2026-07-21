'use client';

import { useQueries } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import { STALE_TIME } from '@/lib/constants';
import { fetchDownloads, fetchPackageMeta } from '@/lib/query/fetchers';
import { useWatchlist } from '@/lib/query/hooks';
import { qk } from '@/lib/query/keys';
import { momentumFromSeries, weeklyFromSeries } from '@/lib/transforms/downloads';
import type { WatchlistRow } from '@/lib/types';
import { ExportButton } from './export-button';
import { NoteEditor } from './note-editor';
import { RowSkeleton } from './skeleton';
import { EmptyState, ErrorState, StaleBanner } from './states';

const countFormat = new Intl.NumberFormat('en-US');

function formatCount(n: number): string {
  return countFormat.format(n);
}

// Matches the markdown export ordering: momentum desc, null momentum last.
// Entries arrive sorted pinnedAt desc and the sort is stable, so ties keep
// most recently pinned first.
function momentumValue(momentum: number | null): number {
  return momentum === null ? Number.NEGATIVE_INFINITY : momentum;
}

// Watchlist tab: joins the watchlist store entries with per-entry package
// meta and 30 day downloads (same query keys and fetchers as the grid cards,
// so warm cache entries are shared) into WatchlistRow view models, sorted by
// momentum desc. The same rows feed the markdown export, so export adds no
// new fetches.
export function WatchlistView() {
  const watchlist = useWatchlist();
  const entries = watchlist.data?.entries ?? [];

  const metaResults = useQueries({
    queries: entries.map((entry) => ({
      queryKey: qk.packageMeta(entry.name),
      queryFn: () => fetchPackageMeta(entry.name),
      staleTime: STALE_TIME.packageMeta,
    })),
  });
  const downloadResults = useQueries({
    queries: entries.map((entry) => ({
      queryKey: qk.downloads(entry.name, 30 as const),
      queryFn: () => fetchDownloads(entry.name, 30),
      staleTime: STALE_TIME.downloads,
    })),
  });

  const rows: WatchlistRow[] = entries
    .map((entry, i) => {
      const series = downloadResults[i]?.data ?? null;
      return {
        entry,
        meta: metaResults[i]?.data ?? null,
        weeklyDownloads: series === null ? null : weeklyFromSeries(series),
        momentum: series === null ? null : momentumFromSeries(series),
      };
    })
    .sort((a, b) => momentumValue(b.momentum) - momentumValue(a.momentum));

  if (watchlist.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-label="Loading watchlist">
        {Array.from({ length: 3 }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (watchlist.isError && watchlist.data === undefined) {
    return (
      <ErrorState
        message={isApiError(watchlist.error) ? watchlist.error.message : 'Could not load the watchlist.'}
        onRetry={() => void watchlist.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {watchlist.data?.store === 'ephemeral' && (
        <StaleBanner message="Demo store: pins and notes are temporary on this deployment." />
      )}
      {watchlist.isError && (
        <StaleBanner message="Showing cached data. Refresh failed, retry shortly." />
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Watchlist</h2>
        <ExportButton rows={rows} />
      </div>

      {rows.length === 0 ? (
        <EmptyState message="Nothing pinned yet. Pin a package from the grid." />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <WatchlistRowCard key={row.entry.name} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function WatchlistRowCard({ row }: { row: WatchlistRow }) {
  const { entry, meta, weeklyDownloads, momentum } = row;

  return (
    <li className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <a
          href={`https://www.npmjs.com/package/${entry.name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-sm font-semibold text-zinc-900 hover:underline dark:text-zinc-100"
        >
          {entry.name}
        </a>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          pinned {entry.pinnedAt.slice(0, 10)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>latest {meta?.latestVersion ?? '-'}</span>
        <span>license {meta?.license ?? '-'}</span>
        <span>{weeklyDownloads === null ? '-' : `${formatCount(weeklyDownloads)} / week`}</span>
        <MomentumBadge momentum={momentum} />
      </div>

      <div className="mt-3">
        <NoteEditor name={entry.name} note={entry.note} />
      </div>
    </li>
  );
}

function MomentumBadge({ momentum }: { momentum: number | null }) {
  if (momentum === null) {
    return <span>momentum -</span>;
  }
  if (momentum > 0) {
    return (
      <span className="font-medium text-emerald-600 dark:text-emerald-400">
        momentum +{formatCount(momentum)}
      </span>
    );
  }
  if (momentum < 0) {
    return (
      <span className="font-medium text-red-600 dark:text-red-400">
        momentum {formatCount(momentum)}
      </span>
    );
  }
  return <span>momentum 0</span>;
}
