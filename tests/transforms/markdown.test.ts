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

  it('flattens and escapes hostile note content so it cannot break out of the table', () => {
    // Security fix G1 (review F4): a note is user-controlled, so pipes,
    // newlines, headings, and code fences in it must stay inert inside the
    // single table row for that entry.
    const hostile: WatchlistRow = {
      entry: {
        name: 'evil-pkg',
        pinnedAt: '2026-07-01T00:00:00.000Z',
        note: 'a | b\n\n# Injected Heading\n```js\nalert(1)\n```',
        noteUpdatedAt: null,
      },
      meta: null,
      weeklyDownloads: null,
      momentum: null,
    };

    const markdown = watchlistToMarkdown([hostile]);
    const lines = markdown.split('\n');

    // Exactly one data row for the entry: newlines were flattened.
    const dataRows = lines.filter((line) => line.startsWith('| ['));
    expect(dataRows).toHaveLength(1);

    // Pipe escaped, no heading line, no fence line.
    expect(dataRows[0]).toContain('a \\| b');
    expect(lines.some((line) => line === '# Injected Heading')).toBe(false);
    expect(lines.some((line) => line.startsWith('```'))).toBe(false);
  });

  it('escapes hostile license and latestVersion so they cannot break the table', () => {
    // Security fix 46 (report 43, FIX 3): license and latestVersion are
    // upstream-controlled (npm registry), so backticks, fence markers,
    // heading syntax, and pipes in them must stay inert inside the single
    // table row for that entry.
    const hostile: WatchlistRow = {
      entry: {
        name: 'evil-meta-pkg',
        pinnedAt: '2026-07-01T00:00:00.000Z',
        note: null,
        noteUpdatedAt: null,
      },
      meta: {
        name: 'evil-meta-pkg',
        description: null,
        latestVersion: '1.0.0` | x\n# Heading\n```',
        license: 'MIT | [x](https://evil.example)\n\n# Injected\n```js\nalert(1)\n```',
        createdAt: null,
        lastPublishAt: null,
        repo: null,
        isMcp: false,
        mcpRegistryName: null,
        hasCliBin: false,
        dependencyCount: 0,
        unpackedSize: null,
        versionCount: 1,
      },
      weeklyDownloads: 1,
      momentum: null,
    };

    const markdown = watchlistToMarkdown([hostile]);
    const lines = markdown.split('\n');

    // Exactly one data row for the entry: newlines were flattened.
    const dataRows = lines.filter((line) => line.startsWith('| ['));
    expect(dataRows).toHaveLength(1);

    // Pipes escaped inside the row, no injected heading or fence lines.
    expect(dataRows[0]).toContain('1.0.0` \\| x # Heading ```');
    expect(dataRows[0]).toContain('MIT \\| [x](https://evil.example) # Injected ```js alert(1) ```');
    expect(lines.some((line) => line === '# Injected')).toBe(false);
    expect(lines.some((line) => line === '# Heading')).toBe(false);
    expect(lines.filter((line) => line.startsWith('```'))).toHaveLength(0);

    // Row still has exactly 6 cells (7 pipes: 2 edges + 5 separators).
    const pipeCount = (dataRows[0].match(/(?<!\\)\|/g) ?? []).length;
    expect(pipeCount).toBe(7);
  });
});
