import { useSyncExternalStore } from 'react';
import type { RateLimitInfo } from '@/lib/types';

// Zero-dependency external store for the GitHub rate-limit budget.
// Fetchers report the envelope headers on every GitHub response; the banner
// subscribes via useRateLimit() without prop drilling.
let snapshot: RateLimitInfo = { remaining: null, resetAt: null };
const listeners = new Set<() => void>();

export function reportRateLimit(info: RateLimitInfo): void {
  snapshot = { remaining: info.remaining, resetAt: info.resetAt };
  for (const cb of listeners) cb();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): RateLimitInfo {
  return snapshot;
}

const SERVER_SNAPSHOT: RateLimitInfo = { remaining: null, resetAt: null };

function getServerSnapshot(): RateLimitInfo {
  return SERVER_SNAPSHOT;
}

export function useRateLimit(): RateLimitInfo {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
