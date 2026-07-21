'use client';

import { useEffect, useRef, useState } from 'react';
import { watchlistToMarkdown } from '@/lib/transforms/markdown';
import type { WatchlistRow } from '@/lib/types';

const EXPORT_FILENAME = 'registry-radar-watchlist.md';
const FEEDBACK_MS = 2000;

// Serializes the already-computed WatchlistRow view models via
// transforms/markdown.ts. No fetches happen here; the rows are exactly what
// the watchlist view rendered.
export function ExportButton({ rows }: { rows: WatchlistRow[] }) {
  const [feedback, setFeedback] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const disabled = rows.length === 0;

  function flash(next: 'copied' | 'failed') {
    setFeedback(next);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), FEEDBACK_MS);
  }

  async function copyToClipboard() {
    const markdown = watchlistToMarkdown(rows);
    try {
      await navigator.clipboard.writeText(markdown);
      flash('copied');
    } catch {
      flash('failed');
    }
  }

  function downloadFile() {
    const markdown = watchlistToMarkdown(rows);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = EXPORT_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex items-center gap-2">
      {feedback === 'copied' && (
        <span role="status" className="text-xs text-emerald-600 dark:text-emerald-400">
          Copied to clipboard
        </span>
      )}
      {feedback === 'failed' && (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          Clipboard unavailable; use Download
        </span>
      )}
      <button
        type="button"
        onClick={() => void copyToClipboard()}
        disabled={disabled}
        className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Copy markdown
      </button>
      <button
        type="button"
        onClick={downloadFile}
        disabled={disabled}
        className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Download .md
      </button>
    </div>
  );
}
