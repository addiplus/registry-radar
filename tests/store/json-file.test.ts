// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonFileWatchlistStore } from '@/lib/store/json-file';
import type { WatchlistEntry } from '@/lib/types';

const originalCwd = process.cwd();
let tempDir: string;

async function readRawFile(): Promise<{ entries: WatchlistEntry[] }> {
  const raw = await fs.readFile(path.join(tempDir, '.data', 'watchlist.json'), 'utf8');
  return JSON.parse(raw) as { entries: WatchlistEntry[] };
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-store-'));
  process.chdir(tempDir);
  vi.stubEnv('VERCEL', '');
});

afterEach(async () => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('JsonFileWatchlistStore', () => {
  it('roundtrips pin, note, and unpin through the JSON file', async () => {
    const store = new JsonFileWatchlistStore();
    expect(store.kind()).toBe('json');
    expect(await store.list()).toEqual([]);

    const pinned = await store.pin('left-pad');
    expect(pinned.name).toBe('left-pad');
    expect(pinned.note).toBeNull();
    await store.pin('is-odd');

    // Re-pin is idempotent: same pinnedAt, no duplicate.
    const repinned = await store.pin('left-pad');
    expect(repinned.pinnedAt).toBe(pinned.pinnedAt);
    expect(await store.list()).toHaveLength(2);

    const noted = await store.setNote('left-pad', 'do not use');
    expect(noted?.note).toBe('do not use');
    expect(noted?.noteUpdatedAt).not.toBeNull();

    // Everything survives a fresh instance reading the same file.
    const reread = await new JsonFileWatchlistStore().list();
    expect(reread.map((entry) => entry.name).sort()).toEqual(['is-odd', 'left-pad']);
    expect(reread.find((entry) => entry.name === 'left-pad')?.note).toBe('do not use');

    await store.unpin('left-pad');
    expect((await store.list()).map((entry) => entry.name)).toEqual(['is-odd']);
    // Idempotent unpin of a missing name, and note on an unpinned name.
    await expect(store.unpin('left-pad')).resolves.toBeUndefined();
    expect(await store.setNote('left-pad', 'gone')).toBeNull();
  });

  it('quarantines a corrupt file and recovers with an empty store', async () => {
    const dataDir = path.join(tempDir, '.data');
    await fs.mkdir(dataDir, { recursive: true });
    const filePath = path.join(dataDir, 'watchlist.json');
    await fs.writeFile(filePath, '{ this is not json', 'utf8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const store = new JsonFileWatchlistStore();
    expect(await store.list()).toEqual([]);

    // The garbage was moved aside, not deleted, and the warning was logged.
    expect(warn).toHaveBeenCalledTimes(1);
    const files = await fs.readdir(dataDir);
    expect(files).not.toContain('watchlist.json');
    const quarantined = files.filter((name) => /^watchlist\.corrupt-\d+\.json$/.test(name));
    expect(quarantined).toHaveLength(1);
    expect(await fs.readFile(path.join(dataDir, quarantined[0]), 'utf8')).toBe(
      '{ this is not json',
    );

    // A schema-invalid file (valid JSON, wrong shape) quarantines the same way.
    await fs.writeFile(filePath, '{"nope": true}', 'utf8');
    expect(await store.list()).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(2);

    // The store is fully usable again after recovery.
    await store.pin('recovered');
    expect((await readRawFile()).entries.map((entry) => entry.name)).toEqual(['recovered']);
  });

  it('serializes concurrent pins into one valid file containing every entry', async () => {
    const store = new JsonFileWatchlistStore();
    const names = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    await Promise.all(names.map((name) => store.pin(name)));

    const parsed = await readRawFile();
    expect(parsed.entries.map((entry) => entry.name).sort()).toEqual([...names].sort());
    expect((await store.list()).map((entry) => entry.name).sort()).toEqual(
      [...names].sort(),
    );

    // Atomic writes clean up after themselves: no stray tempfiles remain.
    const files = await fs.readdir(path.join(tempDir, '.data'));
    expect(files.filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
