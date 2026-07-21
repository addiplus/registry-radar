// Relative age copy for timestamps ("3 days ago"). Pure: callers pass `now`
// so tests are deterministic and components own their clock. Months and years
// are fixed approximations (30 / 365 days); wherever this renders, the
// absolute ISO date stays available as the title tooltip.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

function unit(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? '' : 's'}`;
}

export function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'unknown';
  // Future timestamps clamp to zero rather than rendering negative ages.
  const diff = Math.max(0, now - then);
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) return `${unit(Math.floor(diff / MINUTE_MS), 'minute')} ago`;
  if (diff < DAY_MS) return `${unit(Math.floor(diff / HOUR_MS), 'hour')} ago`;
  if (diff < MONTH_MS) return `${unit(Math.floor(diff / DAY_MS), 'day')} ago`;
  if (diff < YEAR_MS) return `${unit(Math.floor(diff / MONTH_MS), 'month')} ago`;
  return `${unit(Math.floor(diff / YEAR_MS), 'year')} ago`;
}
