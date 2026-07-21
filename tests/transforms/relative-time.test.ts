import { describe, expect, it } from 'vitest';

import { relativeTime } from '@/lib/transforms/relative-time';

const NOW = Date.parse('2026-07-21T12:00:00.000Z');

describe('relativeTime', () => {
  it('returns unknown for unparseable input', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('unknown');
  });

  it('says just now under a minute, and clamps future timestamps', () => {
    expect(relativeTime('2026-07-21T11:59:30.000Z', NOW)).toBe('just now');
    expect(relativeTime('2026-07-21T12:05:00.000Z', NOW)).toBe('just now');
  });

  it('reports minutes, singularized', () => {
    expect(relativeTime('2026-07-21T11:59:00.000Z', NOW)).toBe('1 minute ago');
    expect(relativeTime('2026-07-21T11:17:00.000Z', NOW)).toBe('43 minutes ago');
  });

  it('reports hours up to 24', () => {
    expect(relativeTime('2026-07-21T11:00:00.000Z', NOW)).toBe('1 hour ago');
    expect(relativeTime('2026-07-21T09:00:00.000Z', NOW)).toBe('3 hours ago');
  });

  it('reports days up to 30', () => {
    expect(relativeTime('2026-07-20T12:00:00.000Z', NOW)).toBe('1 day ago');
    expect(relativeTime('2026-07-18T12:00:00.000Z', NOW)).toBe('3 days ago');
  });

  it('reports months in 30 day units under a year', () => {
    expect(relativeTime('2026-05-22T12:00:00.000Z', NOW)).toBe('2 months ago');
    expect(relativeTime('2025-07-24T12:00:00.000Z', NOW)).toBe('12 months ago');
  });

  it('reports years in 365 day units from a year up', () => {
    expect(relativeTime('2025-07-21T12:00:00.000Z', NOW)).toBe('1 year ago');
    expect(relativeTime('2023-07-21T12:00:00.000Z', NOW)).toBe('3 years ago');
  });
});
