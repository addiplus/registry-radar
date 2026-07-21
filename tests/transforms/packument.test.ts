import { describe, expect, it } from 'vitest';

import type { VersionEntry } from '@/lib/types';
import type { Packument } from '@/lib/transforms/packument';
import { paginateVersions, toPackageMeta, versionHistory } from '@/lib/transforms/packument';

function makePackument(): Packument {
  return {
    name: '@acme/widget',
    description: 'Top level description.',
    license: 'MIT',
    'dist-tags': { latest: '1.2.0' },
    time: {
      created: '2024-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:00.000Z',
      '1.0.0': '2024-01-02T00:00:00.000Z',
      '1.1.0': '2024-06-01T00:00:00.000Z',
      '1.2.0': '2026-02-01T00:00:00.000Z',
    },
    versions: {
      '1.0.0': {
        version: '1.0.0',
        license: 'MIT',
        dependencies: { leftpad: '^1.0.0' },
      },
      '1.1.0': { version: '1.1.0', license: 'Apache-2.0' },
      '1.2.0': {
        version: '1.2.0',
        description: 'Latest version description.',
        license: 'BSD-3-Clause',
        dependencies: { alpha: '1.0.0', beta: '2.0.0' },
        devDependencies: { typescript: '5.0.0' },
        bin: { widget: './cli.js' },
        dist: { unpackedSize: 12345, fileCount: 9 },
        repository: 'acme/widgets',
      },
    },
    repository: 'git+https://github.com/acme/widget.git',
  };
}

function makeEntry(version: string): VersionEntry {
  return {
    version,
    publishedAt: null,
    license: null,
    dependencyCount: 0,
    devDependencyCount: 0,
    unpackedSize: null,
    fileCount: null,
    hasBin: false,
    enginesNode: null,
  };
}

describe('toPackageMeta', () => {
  it('maps dist-tags.latest, license from the version object, lastPublishAt from time[latest]', () => {
    const meta = toPackageMeta(makePackument());
    expect(meta.name).toBe('@acme/widget');
    expect(meta.latestVersion).toBe('1.2.0');
    // Version object wins over the top-level "MIT".
    expect(meta.license).toBe('BSD-3-Clause');
    expect(meta.lastPublishAt).toBe('2026-02-01T00:00:00.000Z');
    expect(meta.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(meta.description).toBe('Latest version description.');
    expect(meta.dependencyCount).toBe(2);
    expect(meta.unpackedSize).toBe(12345);
    expect(meta.hasCliBin).toBe(true);
  });

  it('counts versions with a semver filter, excluding created/modified keys', () => {
    const meta = toPackageMeta(makePackument());
    expect(meta.versionCount).toBe(3);
  });

  it('parses a bare string shorthand repository', () => {
    const meta = toPackageMeta(makePackument());
    expect(meta.repo).toEqual({
      owner: 'acme',
      repo: 'widgets',
      url: 'https://github.com/acme/widgets',
      directory: null,
    });
  });

  it('yields repo null when repository is missing', () => {
    const packument = makePackument();
    delete packument.repository;
    delete packument.versions?.['1.2.0'].repository;
    const meta = toPackageMeta(packument);
    expect(meta.repo).toBeNull();
  });

  it('gives dependencyCount 0 without dependencies and unpackedSize null without dist.unpackedSize', () => {
    const packument = makePackument();
    packument['dist-tags'] = { latest: '1.1.0' };
    const meta = toPackageMeta(packument);
    expect(meta.latestVersion).toBe('1.1.0');
    expect(meta.dependencyCount).toBe(0);
    expect(meta.unpackedSize).toBeNull();
    expect(meta.hasCliBin).toBe(false);
  });
});

describe('versionHistory', () => {
  it('sorts by publishedAt desc, missing time entry sorts last with null publishedAt', () => {
    const packument = makePackument();
    packument.versions = {
      ...packument.versions,
      '2.0.0-beta.0': { version: '2.0.0-beta.0' },
    };
    const history = versionHistory(packument);
    expect(history.map((entry) => entry.version)).toEqual([
      '1.2.0',
      '1.1.0',
      '1.0.0',
      '2.0.0-beta.0',
    ]);
    const beta = history[history.length - 1];
    expect(beta.publishedAt).toBeNull();
    expect(beta.hasBin).toBe(false);
    expect(beta.fileCount).toBeNull();
    expect(history[0].hasBin).toBe(true);
  });
});

describe('paginateVersions', () => {
  const items = ['1.4.0', '1.3.0', '1.2.0', '1.1.0', '1.0.0'].map(makeEntry);

  it('slices offset/limit, nextOffset null on final page, total correct', () => {
    const first = paginateVersions(items, 0, 2);
    expect(first.items.map((entry) => entry.version)).toEqual(['1.4.0', '1.3.0']);
    expect(first.nextOffset).toBe(2);
    expect(first.total).toBe(5);

    const middle = paginateVersions(items, 2, 2);
    expect(middle.items.map((entry) => entry.version)).toEqual(['1.2.0', '1.1.0']);
    expect(middle.nextOffset).toBe(4);

    const last = paginateVersions(items, 4, 2);
    expect(last.items.map((entry) => entry.version)).toEqual(['1.0.0']);
    expect(last.nextOffset).toBeNull();
    expect(last.total).toBe(5);
  });
});
