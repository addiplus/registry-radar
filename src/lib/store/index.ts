import { JsonFileWatchlistStore } from './json-file';
import type { WatchlistStore } from './types';
import { UpstashWatchlistStore } from './upstash';

// Env-driven selection lives in this ONE factory. Client code never branches.
// Priority: KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV integration),
// then UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, else local JSON file.
function resolveUpstashConfig(): { url: string; token: string } | null {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) return { url: kvUrl, token: kvToken };
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (restUrl && restToken) return { url: restUrl, token: restToken };
  return null;
}

function createWatchlistStore(): WatchlistStore {
  const upstash = resolveUpstashConfig();
  if (upstash) return new UpstashWatchlistStore(upstash);
  return new JsonFileWatchlistStore();
}

// Cached on globalThis so dev HMR does not recreate the store on every reload.
const globalForStore = globalThis as typeof globalThis & {
  __registryRadarWatchlistStore?: WatchlistStore;
};

export function getWatchlistStore(): WatchlistStore {
  globalForStore.__registryRadarWatchlistStore ??= createWatchlistStore();
  return globalForStore.__registryRadarWatchlistStore;
}
