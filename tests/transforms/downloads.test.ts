import { describe, expect, it } from 'vitest';

import type { DownloadSeries } from '@/lib/types';
import {
  buildNinetyDayRange,
  momentumFromSeries,
  toDownloadSeries,
  weeklyFromSeries,
} from '@/lib/transforms/downloads';

function seriesWith(values: number[]): DownloadSeries {
  return {
    packageName: 'pkg',
    days: 30,
    start: '2026-06-01',
    end: '2026-06-30',
    total: values.reduce((sum, value) => sum + value, 0),
    points: values.map((downloads, index) => ({
      day: `2026-06-${String(index + 1).padStart(2, '0')}`,
      downloads,
    })),
  };
}

describe('toDownloadSeries', () => {
  it('maps a range payload using returned start/end, total summed', () => {
    const series = toDownloadSeries(
      {
        start: '2025-10-05',
        end: '2026-04-01',
        package: 'pkg',
        downloads: [
          { day: '2025-10-05', downloads: 10 },
          { day: '2025-10-06', downloads: 20 },
          { day: '2025-10-07', downloads: 12 },
        ],
      },
      90,
    );
    // Clamp honesty: the returned window is used verbatim, not the
    // requested 90 day window.
    expect(series.start).toBe('2025-10-05');
    expect(series.end).toBe('2026-04-01');
    expect(series.packageName).toBe('pkg');
    expect(series.days).toBe(90);
    expect(series.points).toHaveLength(3);
    expect(series.total).toBe(42);
  });
});

describe('weeklyFromSeries', () => {
  it('sums the last 7 points', () => {
    const series = seriesWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(weeklyFromSeries(series)).toBe(49);
  });
});

describe('momentumFromSeries', () => {
  it('is last 7 minus previous 7, negative when declining', () => {
    const declining = seriesWith([14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(momentumFromSeries(declining)).toBe(28 - 77);
    const rising = seriesWith([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(momentumFromSeries(rising)).toBe(77 - 28);
  });
});

describe('buildNinetyDayRange', () => {
  it('returns start = end minus 89 days (inclusive math)', () => {
    expect(buildNinetyDayRange('2026-07-01')).toEqual({
      start: '2026-04-03',
      end: '2026-07-01',
    });
    // Crosses a year boundary cleanly.
    expect(buildNinetyDayRange('2026-01-15')).toEqual({
      start: '2025-10-18',
      end: '2026-01-15',
    });
  });
});
