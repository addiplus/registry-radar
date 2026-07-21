import type { WatchlistRow } from '../types';

// Markdown export for the watchlist (used by export-button for clipboard
// and download). Rows are sorted by momentum desc, null momentum last.
// Missing meta or downloads render as "-" placeholders; a missing note
// renders as an empty cell. No fetch, no Date.now(): pure serialization
// of the rows the view already computed.
export function watchlistToMarkdown(rows: WatchlistRow[]): string {
  const sorted = [...rows].sort(
    (a, b) => momentumValue(b.momentum) - momentumValue(a.momentum),
  );

  const lines: string[] = [
    '# Registry Radar Watchlist',
    '',
    '| Package | Latest | License | Weekly downloads | Momentum | Note |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const row of sorted) {
    const name = `[${row.entry.name}](https://www.npmjs.com/package/${row.entry.name})`;
    // latestVersion and license are upstream-controlled (npm registry), so
    // they get the same escaping as notes: a hostile value cannot inject
    // pipes, headings, or fences into the export.
    const latest = row.meta?.latestVersion ? escapeCell(row.meta.latestVersion) : '-';
    const license = row.meta?.license ? escapeCell(row.meta.license) : '-';
    const weekly = row.weeklyDownloads === null ? '-' : String(row.weeklyDownloads);
    const momentum =
      row.momentum === null ? '-' : row.momentum > 0 ? `+${row.momentum}` : String(row.momentum);
    const note = row.entry.note === null ? '' : escapeCell(row.entry.note);
    lines.push(`| ${name} | ${latest} | ${license} | ${weekly} | ${momentum} | ${note} |`);
  }

  lines.push('');
  return lines.join('\n');
}

function momentumValue(momentum: number | null): number {
  return momentum === null ? Number.NEGATIVE_INFINITY : momentum;
}

// Keep one table row per entry: pipes escaped, newlines flattened.
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s*\r?\n\s*/g, ' ').trim();
}
