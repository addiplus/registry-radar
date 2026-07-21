'use client';

import { useWatchlist } from '@/lib/query/hooks';
import { usePinMutation } from '@/lib/query/mutations';

// Pure optimistic toggle. Pinned state is derived from the shared watchlist
// query cache; usePinMutation owns the optimistic write and the rollback from
// snapshot. There is no local pin state here, so when the request fails the
// cache snaps back and this button visibly flips back with it.
//
// The button is disabled while this package's mutation is in flight: the
// optimistic flip is what would arm a second click, and a fast Pin -> Unpin
// double click races POST against DELETE over separate connections, which can
// leave the server in the state opposite the user's last intent. Disabling
// does not delay the first click's optimistic flip — that comes from the
// cache write in onMutate, not from the network.
export function PinButton({ name }: { name: string }) {
  const watchlist = useWatchlist();
  const pinned = watchlist.data?.entries.some((entry) => entry.name === name) ?? false;
  const mutation = usePinMutation();
  // TanStack exposes the in-flight `variables`; this hook instance only ever
  // mutates `name`, so the guard is per-package pending.
  const pendingForName = mutation.isPending && mutation.variables?.name === name;

  return (
    <button
      type="button"
      aria-pressed={pinned}
      disabled={pendingForName}
      title={pinned ? 'Unpin package' : 'Pin package'}
      onClick={() => mutation.mutate({ name, pinned })}
      className={
        pinned
          ? 'inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900'
          : 'inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
      }
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill={pinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <path d="M12 2.5l2.9 6.2 6.8.7-5.1 4.6 1.4 6.7-6-3.4-6 3.4 1.4-6.7-5.1-4.6 6.8-.7L12 2.5z" />
      </svg>
      <span>{pinned ? 'Pinned' : 'Pin'}</span>
    </button>
  );
}
