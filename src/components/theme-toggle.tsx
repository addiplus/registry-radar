'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';

const buttonClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:bg-surface-subtle hover:text-foreground';

// Mount gate without an effect: false on the server, true on the client.
// The resolved theme is unknown during SSR and next-themes applies the class
// pre-hydration, so SSR markup must not guess the theme.
const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return <button type="button" disabled aria-hidden="true" className={buttonClass} />;
  }

  const isDark = resolvedTheme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={buttonClass}
    >
      {isDark ? (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
        </svg>
      )}
    </button>
  );
}
