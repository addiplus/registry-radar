import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StoreKind, WatchlistEntry } from '@/lib/types';
import type { WatchlistStore } from './types';

interface WatchlistFileData {
  entries: WatchlistEntry[];
}

function isWatchlistEntry(value: unknown): value is WatchlistEntry {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.pinnedAt === 'string' &&
    (typeof candidate.note === 'string' || candidate.note === null) &&
    (typeof candidate.noteUpdatedAt === 'string' || candidate.noteUpdatedAt === null)
  );
}

function parseWatchlistFile(raw: string): WatchlistFileData {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new SyntaxError('watchlist file is not a JSON object');
  }
  const entries = (parsed as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) {
    throw new SyntaxError('watchlist file has no entries array');
  }
  return { entries: entries.filter(isWatchlistEntry) };
}

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

export class JsonFileWatchlistStore implements WatchlistStore {
  private readonly filePath: string;
  private readonly ephemeral: boolean;
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    // On Vercel serverless the project directory is read-only, so the file
    // degrades to /tmp and the store reports itself as ephemeral.
    this.ephemeral = Boolean(process.env.VERCEL);
    this.filePath = this.ephemeral
      ? path.join('/tmp', 'registry-radar-watchlist.json')
      : path.join(process.cwd(), '.data', 'watchlist.json');
  }

  kind(): StoreKind {
    return this.ephemeral ? 'ephemeral' : 'json';
  }

  async list(): Promise<WatchlistEntry[]> {
    const data = await this.readData();
    return [...data.entries].sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
  }

  pin(name: string): Promise<WatchlistEntry> {
    return this.enqueue(async () => {
      const data = await this.readData();
      const existing = data.entries.find((entry) => entry.name === name);
      if (existing) return existing; // idempotent re-pin keeps original pinnedAt and note
      const entry: WatchlistEntry = {
        name,
        pinnedAt: new Date().toISOString(),
        note: null,
        noteUpdatedAt: null,
      };
      data.entries.push(entry);
      await this.writeData(data);
      return entry;
    });
  }

  async unpin(name: string): Promise<void> {
    await this.enqueue(async () => {
      const data = await this.readData();
      const remaining = data.entries.filter((entry) => entry.name !== name);
      if (remaining.length === data.entries.length) return; // idempotent, nothing to delete
      await this.writeData({ entries: remaining });
    });
  }

  setNote(name: string, note: string | null): Promise<WatchlistEntry | null> {
    return this.enqueue(async () => {
      const data = await this.readData();
      const entry = data.entries.find((candidate) => candidate.name === name);
      if (!entry) return null; // not pinned
      entry.note = note;
      entry.noteUpdatedAt = note === null ? null : new Date().toISOString();
      await this.writeData(data);
      return { ...entry };
    });
  }

  // Serialize read-modify-write cycles so concurrent requests cannot clobber each other.
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async readData(): Promise<WatchlistFileData> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (isEnoent(error)) return { entries: [] };
      throw error;
    }
    try {
      return parseWatchlistFile(raw);
    } catch {
      // A corrupt file (killed mid-write, hand edit) must not 500 every
      // watchlist route forever: quarantine it and boot an empty store.
      await this.quarantineCorruptFile();
      return { entries: [] };
    }
  }

  private async quarantineCorruptFile(): Promise<void> {
    const quarantinePath = path.join(
      path.dirname(this.filePath),
      `${path.basename(this.filePath, '.json')}.corrupt-${Date.now()}.json`,
    );
    let quarantined = false;
    try {
      await fs.rename(this.filePath, quarantinePath);
      quarantined = true;
    } catch {
      // Best effort only: even when the rename fails we still recover empty.
    }
    console.warn(
      quarantined
        ? `[registry-radar] corrupt watchlist file moved to ${path.basename(quarantinePath)}; continuing with an empty store`
        : '[registry-radar] corrupt watchlist file could not be moved; continuing with an empty store',
    );
  }

  // Atomic write: tempfile + rename, so readers never see a partial file.
  private async writeData(data: WatchlistFileData): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, this.filePath);
  }
}
