import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WatchlistEntry, WatchlistResponse } from '@/lib/types';
import { pinPackage, setWatchlistNote, unpinPackage } from './fetchers';
import { qk } from './keys';

// Canonical optimistic mutation pattern:
// onMutate cancels in-flight watchlist queries, snapshots the cache, and writes
// the optimistic value. onError rolls back from the snapshot. onSettled
// invalidates the watchlist key only; package data queries are never refetched
// by mutations.
//
// Refinement for overlapping mutations: every optimistic write stamps a
// monotonically increasing version into its mutation context, tracked per
// query key. onError restores the snapshot only when this mutation still
// holds the latest version for the key — i.e. no newer optimistic mutation
// has started since this one began. Otherwise the restore is skipped, because
// rolling back would clobber the newer mutation's optimistic write with stale
// state; the surviving mutation's own onSettled invalidation converges the
// cache from the server instead.

interface PinVars {
  name: string;
  pinned: boolean;
}

interface NoteVars {
  name: string;
  note: string;
}

interface MutationCtx {
  previous: WatchlistResponse | undefined;
  version: number;
}

// Optimistic-write versions, one running counter per serialized query key.
// Version order matches snapshot order because onMutate runs
// snapshot -> stamp -> write synchronously after the cancelQueries await.
let versionCounter = 0;
const latestVersionByKey = new Map<string, number>();

function stampOptimisticVersion(queryKey: readonly unknown[]): number {
  versionCounter += 1;
  latestVersionByKey.set(JSON.stringify(queryKey), versionCounter);
  return versionCounter;
}

function isLatestOptimisticVersion(queryKey: readonly unknown[], version: number): boolean {
  return latestVersionByKey.get(JSON.stringify(queryKey)) === version;
}

function optimisticPin(old: WatchlistResponse | undefined, vars: PinVars): WatchlistResponse | undefined {
  if (!old) return old;
  if (vars.pinned) {
    return { ...old, entries: old.entries.filter((entry) => entry.name !== vars.name) };
  }
  if (old.entries.some((entry) => entry.name === vars.name)) return old;
  const entry: WatchlistEntry = {
    name: vars.name,
    pinnedAt: new Date().toISOString(),
    note: null,
    noteUpdatedAt: null,
  };
  return { ...old, entries: [entry, ...old.entries] };
}

function optimisticNote(old: WatchlistResponse | undefined, vars: NoteVars): WatchlistResponse | undefined {
  if (!old) return old;
  const trimmed = vars.note.trim();
  return {
    ...old,
    entries: old.entries.map((entry) =>
      entry.name === vars.name
        ? { ...entry, note: trimmed === '' ? null : trimmed, noteUpdatedAt: new Date().toISOString() }
        : entry,
    ),
  };
}

export function usePinMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, pinned }: PinVars): Promise<WatchlistEntry | void> =>
      pinned ? unpinPackage(name) : pinPackage(name),
    onMutate: async (vars): Promise<MutationCtx> => {
      await queryClient.cancelQueries({ queryKey: qk.watchlist() });
      const previous = queryClient.getQueryData<WatchlistResponse>(qk.watchlist());
      const version = stampOptimisticVersion(qk.watchlist());
      queryClient.setQueryData<WatchlistResponse>(qk.watchlist(), (old) => optimisticPin(old, vars));
      return { previous, version };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back only if no newer optimistic mutation has started for this
      // key since this one began; otherwise the newer write wins and the
      // surviving mutation's onSettled invalidation converges the cache.
      if (ctx?.previous && isLatestOptimisticVersion(qk.watchlist(), ctx.version)) {
        queryClient.setQueryData(qk.watchlist(), ctx.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.watchlist() });
    },
  });
}

export function useNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, note }: NoteVars) => setWatchlistNote(name, note),
    onMutate: async (vars): Promise<MutationCtx> => {
      await queryClient.cancelQueries({ queryKey: qk.watchlist() });
      const previous = queryClient.getQueryData<WatchlistResponse>(qk.watchlist());
      const version = stampOptimisticVersion(qk.watchlist());
      queryClient.setQueryData<WatchlistResponse>(qk.watchlist(), (old) => optimisticNote(old, vars));
      return { previous, version };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back only if no newer optimistic mutation has started for this
      // key since this one began; otherwise the newer write wins and the
      // surviving mutation's onSettled invalidation converges the cache.
      if (ctx?.previous && isLatestOptimisticVersion(qk.watchlist(), ctx.version)) {
        queryClient.setQueryData(qk.watchlist(), ctx.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.watchlist() });
    },
  });
}
