'use client';

import { useEffect, useState } from 'react';
import { useRefresh } from '@/lib/query/hooks';
import { useRateLimit } from '@/lib/query/rate-limit';

export function RefreshButton() {
  const refresh = useRefresh();
  const { remaining, resetAt } = useRateLimit();
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick only while limited so the button re-enables itself at the reset time.
  useEffect(() => {
    if (remaining !== 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [remaining]);

  const limited = remaining === 0 && (resetAt === null || resetAt > now);

  function handleClick() {
    setPending(true);
    void refresh().finally(() => setPending(false));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || limited}
      aria-busy={pending}
      title={limited ? 'GitHub API rate limit reached' : 'Refresh all data'}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`}
        aria-hidden="true"
      >
        <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89" />
        <path d="M13.5 2.5v2.6h-2.6" />
      </svg>
      {pending ? 'Refreshing' : 'Refresh'}
    </button>
  );
}
