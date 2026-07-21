import { describe, expect, it } from 'vitest';

import type { WatchlistRow } from '@/lib/types';
import { watchlistToMarkdown } from '@/lib/transforms/markdown';

function makeRows(): WatchlistRow[] {
  return [
    {
      entry: {
        name: 'b-pkg',
        pinnedAt: '2026-07-01T00:00:00.000Z',
        note: 'watch this one',
        noteUpdatedAt: '2026-07-02T00:00:00.000Z',
      },
      meta: null,
      weeklyDownloads: null,
      momentum: -10,
    },
    {
      entry: {
        name: 'a-pkg',
        pinnedAt: '2026-07-03T00:00:00.000Z',
        note: null,
        noteUpdatedAt: null,
      },
      meta: {
        name: 'a-pkg',
        description: 'A package.',
        latestVersion: '1.2.3',
        license: 'MIT',
        createdAt: null,
        lastPublishAt: null,
        repo: null,
        isMcp: false,
        mcpRegistryName: null,
        hasCliBin: false,
        dependencyCount: 0,
        unpackedSize: null,
        versionCount: 3,
      },
      weeklyDownloads: 1234,
      momentum: 56,
    },
  ];
}

describe('watchlistToMarkdown', () => {
  it('renders title, one row per entry sorted by momentum, notes, and placeholders', () => {
    const markdown = watchlistToMarkdown(makeRows());

    // Title.
    expect(markdown).toContain('# Registry Radar Watchlist');

    // One table row per entry.
    const dataRows = markdown.split('\n').filter((line) => line.startsWith('| ['));
    expect(dataRows).toHaveLength(2);

    // Sorted by momentum desc: a-pkg (56) before b-pkg (-10).
    expect(markdown.indexOf('[a-pkg]')).toBeLessThan(markdown.indexOf('[b-pkg]'));

    // Meta fields and momentum sign.
    expect(markdown).toContain('| [a-pkg](https://www.npmjs.com/package/a-pkg) | 1.2.3 | MIT | 1234 | +56 |  |');

    // Note text included; missing meta/downloads render placeholders.
    expect(markdown).toContain('watch this one');
    expect(markdown).toContain('| [b-pkg](https://www.npmjs.com/package/b-pkg) | - | - | - | -10 | watch this one |');
  });
});
