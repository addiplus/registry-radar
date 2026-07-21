'use client';

export type TabKey = 'packages' | 'repos' | 'watchlist';

interface TabsProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'packages', label: 'Packages' },
  { key: 'repos', label: 'Repos' },
  { key: 'watchlist', label: 'Watchlist' },
];

export function Tabs({ active, onChange }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Dashboard views"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-subtle p-1"
    >
      {TAB_ITEMS.map((item) => {
        const selected = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              selected
                ? 'bg-surface text-foreground shadow-sm'
                : 'text-muted hover:text-foreground'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
