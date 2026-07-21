import type { DayStamp, DownloadDays, DownloadPoint, DownloadSeries } from '../types';

// Shape of the npm downloads range API payload
// (api.npmjs.org/downloads/range/{start}:{end}/{name} and the
// range/last-week, range/last-month shortcuts).
export interface NpmDownloadsRange {
  start?: string;
  end?: string;
  package?: string;
  downloads?: { day?: string; downloads?: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Clamp honesty: start/end come from the API response, never from the
// requested range (npm silently clamps custom ranges to about 547 days).
// Total is summed here because the range payload carries no total field.
export function toDownloadSeries(payload: NpmDownloadsRange, days: DownloadDays): DownloadSeries {
  const points: DownloadPoint[] = (payload.downloads ?? []).map((point) => ({
    day: String(point.day ?? ''),
    downloads: Number(point.downloads ?? 0),
  }));
  return {
    packageName: payload.package ?? '',
    days,
    start: payload.start ?? '',
    end: payload.end ?? '',
    total: points.reduce((sum, point) => sum + point.downloads, 0),
    points,
  };
}

// Card weekly downloads: sum of the last 7 points of the 30d series.
export function weeklyFromSeries(series: DownloadSeries): number {
  return sumPoints(series.points.slice(-7));
}

// Watchlist momentum: sum(last 7d) minus sum(previous 7d).
export function momentumFromSeries(series: DownloadSeries): number {
  return sumPoints(series.points.slice(-7)) - sumPoints(series.points.slice(-14, -7));
}

// Inclusive range math for the 90d view: end minus 89 days gives exactly
// 90 days including both ends. Anchored off the API-returned end, so no
// Date.now() and no timezone drift (all math in UTC).
export function buildNinetyDayRange(end: DayStamp): { start: DayStamp; end: DayStamp } {
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  const startMs = endMs - 89 * DAY_MS;
  return { start: new Date(startMs).toISOString().slice(0, 10), end };
}

function sumPoints(points: DownloadPoint[]): number {
  return points.reduce((sum, point) => sum + point.downloads, 0);
}
