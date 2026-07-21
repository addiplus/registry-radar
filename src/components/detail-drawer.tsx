'use client';

import { useEffect, useState } from 'react';
import { isApiError } from '@/lib/api-error';
import {
  useDownloads,
  usePackageMeta,
  useRepoSignals,
  useVersionHistory,
  useWatchlist,
} from '@/lib/query/hooks';
import type { DownloadDays, VersionEntry } from '@/lib/types';
import { CiBadge } from './ci-badge';
import { NoteEditor } from './note-editor';
import { PinButton } from './pin-button';
import { SeriesChart } from './series-chart';
import { DrawerSkeleton } from './skeleton';
import { EmptyState, ErrorState } from './states';

const countFormat = new Intl.NumberFormat('en-US');

function formatCount(n: number): string {
  return countFormat.format(n);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  return iso === null ? '-' : iso.slice(0, 10);
}

const RANGE_OPTIONS: DownloadDays[] = [7, 30, 90];

// Right-side detail drawer, opened from a package card. The outer component
// is a pure gate so every hook inside DrawerContent runs only while the
// drawer is open; version history is additionally enabled-gated per the plan.
export function DetailDrawer({ name, onClose }: { name: string | null; onClose: () => void }) {
  if (name === null) return null;
  return <DrawerContent name={name} onClose={onClose} />;
}

function DrawerContent({ name, onClose }: { name: string; onClose: () => void }) {
  const [days, setDays] = useState<DownloadDays>(30);
  const meta = usePackageMeta(name);
  const downloads = useDownloads(name, days);
  const versions = useVersionHistory(name, true);
  const signals = useRepoSignals(meta.data?.repo);
  const watchlist = useWatchlist();
  const entry = watchlist.data?.entries.find((e) => e.name === name) ?? null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const versionItems = versions.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Package details for ${name}`}
      className="fixed inset-0 z-50"
    >
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col gap-5 overflow-y-auto border-l border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-mono text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {name}
            </h2>
            <a
              href={`https://www.npmjs.com/package/${name}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
            >
              View on npm
            </a>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PinButton name={name} />
            <button
              type="button"
              onClick={onClose}
              autoFocus
              aria-label="Close details"
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </header>

        <section aria-label="Package facts">
          {meta.isPending && (
            <div className="flex flex-col gap-2" aria-label="Loading package metadata">
              <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            </div>
          )}
          {meta.isError && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span>Package metadata unavailable.</span>
              <button
                type="button"
                onClick={() => void meta.refetch()}
                className="text-xs font-medium underline"
              >
                Retry
              </button>
            </div>
          )}
          {meta.data !== undefined && (
            <>
              {meta.data.description !== null && (
                <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {meta.data.description}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Fact label="Latest version" value={meta.data.latestVersion} />
                <Fact label="License" value={meta.data.license ?? '-'} />
                <Fact label="Dependencies" value={formatCount(meta.data.dependencyCount)} />
                <Fact label="Unpacked size" value={formatBytes(meta.data.unpackedSize)} />
                <Fact label="Versions" value={formatCount(meta.data.versionCount)} />
                <Fact label="Published" value={formatDate(meta.data.lastPublishAt)} />
              </dl>
            </>
          )}
        </section>

        <section aria-label="Downloads">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Downloads</h3>
            <div className="flex gap-1" role="group" aria-label="Download range">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={days === option}
                  onClick={() => setDays(option)}
                  className={
                    days === option
                      ? 'rounded-md border border-zinc-400 bg-zinc-900 px-2 py-0.5 text-xs font-medium text-white dark:border-zinc-500 dark:bg-zinc-100 dark:text-zinc-900'
                      : 'rounded-md border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }
                >
                  {option}d
                </button>
              ))}
            </div>
          </div>
          {downloads.isPending && (
            <div className="h-40 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
          )}
          {downloads.isError && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Download stats unavailable.</p>
          )}
          {downloads.data !== undefined && (
            <>
              <SeriesChart points={downloads.data.points} mode="full" />
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {formatCount(downloads.data.total)} downloads in {downloads.data.days} days ending{' '}
                {downloads.data.end}
              </p>
            </>
          )}
        </section>

        <section aria-label="GitHub repository">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            GitHub repository
          </h3>
          {meta.data !== undefined && meta.data.repo === null && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No linked GitHub repo.</p>
          )}
          {(meta.data === undefined || meta.data.repo !== null) && (
            <>
              {signals.isPending && (
                <div
                  className="h-3 w-2/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800"
                  aria-label="Loading repository signals"
                />
              )}
              {signals.isError &&
                (isApiError(signals.error) && signals.error.code === 'RATE_LIMITED' ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    GitHub data paused until reset.
                  </p>
                ) : (
                  <ErrorState
                    message={
                      isApiError(signals.error)
                        ? signals.error.message
                        : 'Repository signals unavailable.'
                    }
                    onRetry={() => void signals.refetch()}
                  />
                ))}
              {signals.data !== undefined && (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <a
                      href={signals.data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate font-mono text-xs text-zinc-700 hover:underline dark:text-zinc-300"
                    >
                      {signals.data.fullName}
                    </a>
                    <CiBadge ci={signals.data.ci} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{formatCount(signals.data.stars)} stars</span>
                    <span>{formatCount(signals.data.forks)} forks</span>
                    <span>{formatCount(signals.data.openIssuePrCount)} open issues + PRs</span>
                    {signals.data.language !== null && <span>{signals.data.language}</span>}
                    {signals.data.licenseSpdx !== null && <span>{signals.data.licenseSpdx}</span>}
                    {signals.data.lastPushAt !== null && (
                      <span>last push {signals.data.lastPushAt.slice(0, 10)}</span>
                    )}
                    {signals.data.archived && <span>archived</span>}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section aria-label="Version history">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Versions
            {versions.data !== undefined && ` (${formatCount(versions.data.pages[0]?.total ?? 0)})`}
          </h3>
          {versions.isPending && <DrawerSkeleton />}
          {versions.isError && (
            <ErrorState
              message={
                isApiError(versions.error) ? versions.error.message : 'Version history unavailable.'
              }
              onRetry={() => void versions.refetch()}
            />
          )}
          {versions.data !== undefined && versionItems.length === 0 && (
            <EmptyState message="No published versions." />
          )}
          {versionItems.length > 0 && (
            <>
              <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
                {versionItems.map((version) => (
                  <VersionRow key={version.version} version={version} />
                ))}
              </ul>
              {versions.hasNextPage && (
                <button
                  type="button"
                  onClick={() => void versions.fetchNextPage()}
                  disabled={versions.isFetchingNextPage}
                  className="mt-2 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {versions.isFetchingNextPage ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
          )}
        </section>

        <section aria-label="Note">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Note</h3>
          {entry === null ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Pin the package before adding a note.
            </p>
          ) : (
            <NoteEditor key={entry.name} name={entry.name} note={entry.note} />
          )}
        </section>
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-sm text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}

function VersionRow({ version }: { version: VersionEntry }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="font-mono text-xs text-zinc-900 dark:text-zinc-100">{version.version}</span>
      <span className="flex gap-x-3 text-xs text-zinc-500 dark:text-zinc-400">
        <span>{formatDate(version.publishedAt)}</span>
        <span>{formatCount(version.dependencyCount)} deps</span>
        <span>{formatBytes(version.unpackedSize)}</span>
      </span>
    </li>
  );
}
