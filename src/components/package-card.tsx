'use client';

import { isApiError } from '@/lib/api-error';
import { useDownloads, usePackageMeta, usePrefetchPackageDetail, useRepoSignals } from '@/lib/query/hooks';
import { weeklyFromSeries } from '@/lib/transforms/downloads';
import type { PackageSummary } from '@/lib/types';
import { CiBadge } from './ci-badge';
import { CliBadge, McpBadge } from './mcp-badge';
import { PinButton } from './pin-button';
import { SeriesChart } from './series-chart';

interface PackageCardProps {
  summary: PackageSummary;
  onOpen: (name: string) => void;
}

const compactNumber = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function relativePublish(iso: string | null): string {
  if (iso === null) return 'unknown';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'unknown';
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const retryClass =
  'text-xs font-medium text-accent underline-offset-2 hover:underline';

export function PackageCard({ summary, onOpen }: PackageCardProps) {
  const name = summary.name;
  const metaQuery = usePackageMeta(name);
  const downloadsQuery = useDownloads(name, 30);
  const meta = metaQuery.data ?? null;
  const signalsQuery = useRepoSignals(meta?.repo);
  const prefetchDetail = usePrefetchPackageDetail(name);

  const description = meta?.description ?? summary.description;
  const version = meta?.latestVersion ?? summary.version;
  const license = meta?.license ?? summary.license;
  const series = downloadsQuery.data ?? null;
  const weekly = series !== null ? weeklyFromSeries(series) : null;

  return (
    <article
      onClick={() => onOpen(name)}
      onMouseEnter={prefetchDetail}
      className="group flex cursor-pointer flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm transition-colors hover:border-accent/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-mono text-sm font-semibold text-foreground" title={name}>
            {name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {`v${version}`}
            {license !== null && ` | ${license}`}
          </p>
        </div>
        <span onClick={(event) => event.stopPropagation()}>
          <PinButton name={name} />
        </span>
      </div>

      <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted">
        {description ?? 'No description.'}
      </p>

      {metaQuery.isPending && (
        <div className="flex flex-col gap-2" aria-busy="true">
          <div className="h-3 w-1/2 animate-pulse rounded bg-surface-subtle" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-subtle" />
        </div>
      )}

      {metaQuery.isError && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-danger/30 bg-danger/5 px-2 py-1.5">
          <p className="text-xs text-muted">Package metadata unavailable.</p>
          <button
            type="button"
            className={retryClass}
            onClick={(event) => {
              event.stopPropagation();
              void metaQuery.refetch();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {meta !== null && (meta.isMcp || meta.hasCliBin) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {meta.isMcp && <McpBadge registryName={meta.mcpRegistryName} />}
          {!meta.isMcp && meta.hasCliBin && <CliBadge />}
        </div>
      )}

      <div>
        {downloadsQuery.isPending && (
          <div className="h-10 w-full animate-pulse rounded bg-surface-subtle" aria-busy="true" />
        )}
        {downloadsQuery.isError && (
          <div className="flex h-10 w-full items-center justify-center rounded bg-surface-subtle text-xs text-muted">
            Download stats unavailable.
          </div>
        )}
        {series !== null && (
          <>
            <SeriesChart points={series.points} mode="spark" className="h-10 w-full" />
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <p className="text-xs text-muted">
                <span className="text-sm font-semibold text-foreground">
                  {weekly !== null ? compactNumber.format(weekly) : '0'}
                </span>
                {' downloads last week'}
              </p>
              <p className="text-[11px] text-muted">{`week ending ${series.end}`}</p>
            </div>
          </>
        )}
      </div>

      {meta !== null && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>{`${meta.dependencyCount} deps`}</span>
          {meta.unpackedSize !== null && <span>{formatBytes(meta.unpackedSize)}</span>}
          <span>{`${meta.versionCount} versions`}</span>
          <span suppressHydrationWarning>{`published ${relativePublish(meta.lastPublishAt)}`}</span>
        </div>
      )}

      {meta !== null &&
        (meta.repo === null ? (
          <p className="text-[11px] text-muted">No linked GitHub repo.</p>
        ) : signalsQuery.isPending ? (
          <div className="h-3 w-1/3 animate-pulse rounded bg-surface-subtle" aria-busy="true" />
        ) : signalsQuery.isError ? (
          isApiError(signalsQuery.error) && signalsQuery.error.code === 'RATE_LIMITED' ? (
            <p className="text-[11px] text-muted">GitHub data paused until reset.</p>
          ) : (
            <button
              type="button"
              className={retryClass}
              onClick={(event) => {
                event.stopPropagation();
                void signalsQuery.refetch();
              }}
            >
              Retry GitHub signals
            </button>
          )
        ) : (
          signalsQuery.data !== undefined && (
            <div className="flex items-center gap-2 text-[11px] text-muted">
              <span>{`${compactNumber.format(signalsQuery.data.stars)} stars`}</span>
              <span>{`${compactNumber.format(signalsQuery.data.forks)} forks`}</span>
              <CiBadge ci={signalsQuery.data.ci} />
            </div>
          )
        ))}
    </article>
  );
}
