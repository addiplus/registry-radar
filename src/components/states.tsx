'use client';

// Shared state blocks (plan section 6): EmptyState, ErrorState with retry,
// and StaleBanner for stale-while-error and the ephemeral demo store.

interface EmptyStateProps {
  message: string;
  hint?: string;
}

export function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{message}</p>
      {hint !== undefined && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-6 py-10 text-center"
    >
      <p className="text-sm text-foreground">{message}</p>
      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className="h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-subtle"
        >
          Retry
        </button>
      )}
    </div>
  );
}

interface StaleBannerProps {
  message: string;
}

export function StaleBanner({ message }: StaleBannerProps) {
  return (
    <div
      role="status"
      className="mb-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning"
    >
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
      {message}
    </div>
  );
}
