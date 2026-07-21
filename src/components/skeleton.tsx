'use client';

// Loading placeholders for the grid, drawer, and list rows (plan section 6).

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-surface-subtle ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex w-full flex-col gap-2">
          <Pulse className="h-4 w-2/3" />
          <Pulse className="h-3 w-1/3" />
        </div>
        <Pulse className="h-7 w-7 shrink-0" />
      </div>
      <Pulse className="h-3 w-full" />
      <Pulse className="h-3 w-4/5" />
      <Pulse className="h-10 w-full" />
      <Pulse className="h-3 w-1/2" />
    </div>
  );
}

export function DrawerSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <Pulse className="h-5 w-1/2" />
      <Pulse className="h-3 w-2/3" />
      <Pulse className="h-32 w-full" />
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center justify-between gap-3">
          <Pulse className="h-3 w-1/4" />
          <Pulse className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
    >
      <div className="flex w-full flex-col gap-2">
        <Pulse className="h-3.5 w-1/3" />
        <Pulse className="h-3 w-2/3" />
      </div>
      <Pulse className="h-3 w-12 shrink-0" />
    </div>
  );
}
