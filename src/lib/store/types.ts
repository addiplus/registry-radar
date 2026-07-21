import type { StoreKind, WatchlistEntry } from '@/lib/types';

export interface WatchlistStore {
  kind(): StoreKind;
  list(): Promise<WatchlistEntry[]>;
  pin(name: string): Promise<WatchlistEntry>; // idempotent
  unpin(name: string): Promise<void>; // idempotent
  setNote(name: string, note: string | null): Promise<WatchlistEntry | null>; // null = not pinned
}
