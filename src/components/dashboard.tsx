'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { DetailDrawer } from './detail-drawer';
import { PackageGrid } from './package-grid';
import { RateLimitBanner } from './rate-limit-banner';
import { RefreshButton } from './refresh-button';
import { RepoList } from './repo-list';
import { ScopeSwitcher, type ScopeSettings } from './scope-switcher';
import { Tabs, type TabKey } from './tabs';
import { ThemeToggle } from './theme-toggle';
import { WatchlistView } from './watchlist-view';

const SCOPE_STORAGE_KEY = 'rr:scope';

interface DashboardProps {
  defaultScope: string;
  defaultUser: string;
}

function parseStoredScope(raw: string | null): ScopeSettings | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const npmScope = record.npmScope;
    const githubUser = record.githubUser;
    if (typeof npmScope !== 'string' || typeof githubUser !== 'string') return null;
    if (npmScope.trim() === '' || githubUser.trim() === '') return null;
    return { npmScope, githubUser };
  } catch {
    return null;
  }
}

// localStorage as an external store. The snapshot is cached by raw string so
// useSyncExternalStore never loops; the server snapshot is null, so the first
// client render matches SSR and the stored scope applies right after hydrate.
let storageCache: { raw: string | null; value: ScopeSettings | null } = {
  raw: null,
  value: null,
};

function getStoredScope(): ScopeSettings | null {
  try {
    const raw = window.localStorage.getItem(SCOPE_STORAGE_KEY);
    if (raw !== storageCache.raw) {
      storageCache = { raw, value: parseStoredScope(raw) };
    }
    return storageCache.value;
  } catch {
    return null;
  }
}

function getServerScope(): ScopeSettings | null {
  return null;
}

const storageSubscribe = () => () => {};

export function Dashboard({ defaultScope, defaultUser }: DashboardProps) {
  const storedScope = useSyncExternalStore(storageSubscribe, getStoredScope, getServerScope);
  const [appliedScope, setAppliedScope] = useState<ScopeSettings | null>(null);
  const scope = appliedScope ?? storedScope ?? {
    npmScope: defaultScope,
    githubUser: defaultUser,
  };
  const [tab, setTab] = useState<TabKey>('packages');
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  const applyScope = useCallback((next: ScopeSettings) => {
    setAppliedScope(next);
    try {
      window.localStorage.setItem(SCOPE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode); the scope still applies in memory.
    }
  }, []);

  const closeDrawer = useCallback(() => setSelectedPackage(null), []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">Registry Radar</h1>
            <p className="truncate text-xs text-muted">
              Package registry and repository signals in one place.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <RefreshButton />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-4 sm:px-6">
        <RateLimitBanner />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs active={tab} onChange={setTab} />
          <ScopeSwitcher
            npmScope={scope.npmScope}
            githubUser={scope.githubUser}
            onApply={applyScope}
          />
        </div>

        <main className="mt-4">
          {tab === 'packages' && (
            <PackageGrid scope={scope.npmScope} onOpenPackage={setSelectedPackage} />
          )}
          {tab === 'repos' && <RepoList user={scope.githubUser} />}
          {tab === 'watchlist' && <WatchlistView />}
        </main>
      </div>

      <DetailDrawer name={selectedPackage} onClose={closeDrawer} />
    </div>
  );
}
