'use client';

import { useEffect, useState } from 'react';
import { useRateLimit } from '@/lib/query/rate-limit';

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function RateLimitBanner() {
  const { remaining, resetAt } = useRateLimit();
  const [now, setNow] = useState(() => Date.now());

  // The countdown ticks once per second only while the limit is hit.
  useEffect(() => {
    if (remaining !== 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [remaining]);

  if (remaining === null) return null;

  if (remaining === 0) {
    const message =
      resetAt !== null
        ? `GitHub API rate limit reached. Resets in ${formatCountdown(resetAt - now)}.`
        : 'GitHub API rate limit reached.';
    return (
      <div
        role="alert"
        className="mb-3 flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-medium text-danger"
      >
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-danger" />
        {message}
      </div>
    );
  }

  if (remaining <= 10) {
    return (
      <div
        role="status"
        className="mb-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
      >
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
        {`GitHub API budget low: ${remaining} requests left this hour.`}
      </div>
    );
  }

  return null;
}
