import type { PackageMeta, VersionEntry, VersionPage } from '../types';
import { deriveMcp } from './mcp';
import { parseRepoUrl } from './repo-url';

// Minimal shapes for the npm full packument (registry.npmjs.org/{name}).
// Only the fields this app reads are declared; everything else passes
// through untouched at runtime.
export type RepositoryField =
  | string
  | { type?: string; url?: string; directory?: string };

export interface PackumentVersion {
  name?: string;
  version?: string;
  description?: string;
  license?: string | { type?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
  engines?: { node?: string };
  dist?: { unpackedSize?: number; fileCount?: number };
  repository?: RepositoryField;
  mcpName?: string;
}

export interface Packument {
  name?: string;
  description?: string;
  license?: string | { type?: string };
  'dist-tags'?: Record<string, string>;
  time?: Record<string, string>;
  versions?: Record<string, PackumentVersion>;
  repository?: RepositoryField;
  mcpName?: string;
}

// Semver keys only. `time` also carries created/modified and `versions`
// can carry junk keys; neither may leak into counts or history.
const VERSION_KEY = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function versionKeys(packument: Packument): string[] {
  const keys =
    packument.versions !== undefined
      ? Object.keys(packument.versions)
      : Object.keys(packument.time ?? {});
  return keys.filter((key) => VERSION_KEY.test(key));
}

// npm license is a string on modern packages; legacy packs used
// { type: "MIT" } objects. Anything else is unreadable, so null.
function licenseOf(license: Packument['license']): string | null {
  if (typeof license === 'string') return license;
  if (license !== null && typeof license === 'object' && typeof license.type === 'string') {
    return license.type;
  }
  return null;
}

function hasBin(bin: PackumentVersion['bin']): boolean {
  if (bin === undefined || bin === null) return false;
  if (typeof bin === 'string') return bin.length > 0;
  return Object.keys(bin).length > 0;
}

// Drawer header + card facts for one package. License comes from the
// latest version object (never the top-level field), lastPublishAt from
// time[latest]. Throws when dist-tags.latest is absent: that is a
// malformed upstream response, not a renderable package.
export function toPackageMeta(packument: Packument): PackageMeta {
  const latest = packument['dist-tags']?.latest;
  if (latest === undefined) {
    throw new Error('Packument is missing dist-tags.latest.');
  }
  const version = packument.versions?.[latest];
  const time = packument.time ?? {};
  const mcp = deriveMcp(packument);

  return {
    name: packument.name ?? version?.name ?? '',
    description: version?.description ?? packument.description ?? null,
    latestVersion: latest,
    license: licenseOf(version?.license),
    createdAt: time.created ?? null,
    lastPublishAt: time[latest] ?? null,
    repo: parseRepoUrl(version?.repository ?? packument.repository ?? null),
    isMcp: mcp.isMcp,
    mcpRegistryName: mcp.mcpRegistryName,
    hasCliBin: mcp.hasCliBin,
    dependencyCount: Object.keys(version?.dependencies ?? {}).length,
    unpackedSize: version?.dist?.unpackedSize ?? null,
    versionCount: versionKeys(packument).length,
  };
}

// All published versions sorted by publishedAt desc. Versions with no
// time entry sort last with publishedAt null (ISO strings sort
// lexicographically, which is chronological here).
export function versionHistory(packument: Packument): VersionEntry[] {
  const versions = packument.versions ?? {};
  const time = packument.time ?? {};

  const entries: VersionEntry[] = versionKeys(packument).map((key) => {
    const version = versions[key];
    return {
      version: key,
      publishedAt: time[key] ?? null,
      license: licenseOf(version?.license),
      dependencyCount: Object.keys(version?.dependencies ?? {}).length,
      devDependencyCount: Object.keys(version?.devDependencies ?? {}).length,
      unpackedSize: version?.dist?.unpackedSize ?? null,
      fileCount: version?.dist?.fileCount ?? null,
      hasBin: hasBin(version?.bin),
      enginesNode: version?.engines?.node ?? null,
    };
  });

  entries.sort((a, b) => {
    if (a.publishedAt === null) return b.publishedAt === null ? 0 : 1;
    if (b.publishedAt === null) return -1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
  return entries;
}

// Honest server pagination: nextOffset is null on the final page.
export function paginateVersions(
  items: VersionEntry[],
  offset: number,
  limit: number,
): VersionPage {
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    nextOffset: offset + limit < items.length ? offset + limit : null,
  };
}
