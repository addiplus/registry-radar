import { Redis } from '@upstash/redis';
import type { StoreKind, WatchlistEntry } from '@/lib/types';
import type { WatchlistStore } from './types';

// Single shared demo watchlist. No per-user keys.
const WATCHLIST_KEY = 'registry-radar:watchlist'; // ZSET: member = package name, score = pinnedAt epoch ms
const NOTE_KEY_PREFIX = 'registry-radar:note:'; // STRING: JSON StoredNote

interface StoredNote {
  note: string;
  updatedAt: string;
}

function noteKey(name: string): string {
  return `${NOTE_KEY_PREFIX}${name}`;
}

function parseStoredNote(value: unknown): StoredNote | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.note !== 'string' || typeof candidate.updatedAt !== 'string') {
    return null;
  }
  return { note: candidate.note, updatedAt: candidate.updatedAt };
}

function toEntry(name: string, scoreMs: number, stored: StoredNote | null): WatchlistEntry {
  return {
    name,
    pinnedAt: new Date(scoreMs).toISOString(),
    note: stored?.note ?? null,
    noteUpdatedAt: stored?.updatedAt ?? null,
  };
}

export class UpstashWatchlistStore implements WatchlistStore {
  private readonly redis: Redis;

  constructor(config: { url: string; token: string }) {
    this.redis = new Redis({ url: config.url, token: config.token });
  }

  kind(): StoreKind {
    return 'redis';
  }

  async list(): Promise<WatchlistEntry[]> {
    const names = await this.redis.zrange<string[]>(WATCHLIST_KEY, 0, -1, { rev: true });
    if (names.length === 0) return [];

    // One round trip: a zscore per member, then a single mget for all notes.
    const pipeline = this.redis.pipeline();
    for (const name of names) {
      pipeline.zscore(WATCHLIST_KEY, name);
    }
    pipeline.mget<(StoredNote | null)[]>(names.map(noteKey));
    const results: unknown[] = await pipeline.exec();

    const rawNotes = results[names.length];
    const notes: (StoredNote | null)[] = Array.isArray(rawNotes)
      ? rawNotes.map(parseStoredNote)
      : names.map(() => null);

    const entries: WatchlistEntry[] = [];
    for (const [index, name] of names.entries()) {
      const score = results[index];
      if (typeof score !== 'number') continue; // member vanished between zrange and pipeline
      entries.push(toEntry(name, score, notes[index] ?? null));
    }
    return entries;
  }

  async pin(name: string): Promise<WatchlistEntry> {
    const nowMs = Date.now();
    // nx keeps the original score on re-pin, so pinnedAt stays stable (idempotent).
    await this.redis.zadd(WATCHLIST_KEY, { nx: true }, { score: nowMs, member: name });
    const score = await this.redis.zscore(WATCHLIST_KEY, name);
    const stored = parseStoredNote(await this.redis.get<unknown>(noteKey(name)));
    return toEntry(name, score ?? nowMs, stored);
  }

  async unpin(name: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.zrem(WATCHLIST_KEY, name);
    pipeline.del(noteKey(name));
    await pipeline.exec();
  }

  async setNote(name: string, note: string | null): Promise<WatchlistEntry | null> {
    const score = await this.redis.zscore(WATCHLIST_KEY, name);
    if (score === null) return null; // not pinned
    if (note === null) {
      await this.redis.del(noteKey(name));
      return toEntry(name, score, null);
    }
    const stored: StoredNote = { note, updatedAt: new Date().toISOString() };
    await this.redis.set(noteKey(name), stored);
    return toEntry(name, score, stored);
  }
}
