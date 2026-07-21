import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ApiError, isApiError } from '@/lib/api-error';
import { httpStatusFor, npmError } from '@/lib/transforms/errors';
import type {
  ApiErrorBody,
  DownloadDays,
  DownloadPoint,
  DownloadSeries,
  PackageMeta,
  PackageSummary,
  RepoRef,
  ScopePackagesResponse,
  VersionEntry,
  VersionPage,
} from '@/lib/types';

// Upstream hosts (recon 01): registry.npmjs.org for metadata, api.npmjs.org for download stats.
const REGISTRY_HOST = 'https://registry.npmjs.org';
const DOWNLOADS_HOST = 'https://api.npmjs.org';

// Shared revalidate seconds: used for the upstream fetch data cache and for the
// Cache-Control header on route responses (stale-while-revalidate is 2x per plan section 3).
export const NPM_REVALIDATE = {
  packages: 1800,
  meta: 1800,
  versions: 1800,
  downloads: 3600,
} as const;

const SEARCH_PAGE_SIZE = 250;
const SEARCH_MAX_PAGES = 4;
const SEMVER_KEY = /^\d+\.\d+\.\d+/;
const MCP_SDK = '@modelcontextprotocol/sdk';
const NINETY_DAY_SPAN_MS = 89 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// JSON narrowing helpers. Upstream payloads are untyped, so every field is
// read through these instead of being trusted (recon 01 gotcha 8).
// ---------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function binKeys(value: unknown): string[] {
  const record = rec(value);
  if (record) return Object.keys(record);
  // Very old manifests use a bare string bin; the executable name is the package name.
  return typeof value === 'string' && value.length > 0 ? [''] : [];
}

function licenseOf(versionDoc: Record<string, unknown> | null): string | null {
  if (!versionDoc) return null;
  const direct = str(versionDoc.license);
  if (direct) return direct;
  // Very old manifests use { type: 'MIT', url: '...' }.
  return str(rec(versionDoc.license)?.type);
}

// ---------------------------------------------------------------------------
// Repository URL parsing (recon 01 gotcha 9, plan section 10 cases 8 to 16).
// Only GitHub URLs produce a RepoRef; anything else returns null.
// ---------------------------------------------------------------------------

function parseRepoRef(repository: unknown): RepoRef | null {
  let rawUrl: string | null = null;
  let directory: string | null = null;
  const record = rec(repository);
  if (record) {
    rawUrl = str(record.url);
    directory = str(record.directory);
  } else {
    rawUrl = str(repository);
  }
  if (!rawUrl) return null;

  const value = rawUrl.trim();
  const match =
    /^github:([^/\s]+)\/([^/\s]+)$/.exec(value) ??
    /^git@github\.com:([^/]+)\/([^/]+)$/.exec(value) ??
    /^(?:git\+)?(?:https?|git|ssh):\/\/(?:git@)?(?:www\.)?github\.com\/([^/]+)\/([^/]+?)\/?$/i.exec(value) ??
    /^([\w.-]+)\/([\w.-]+)$/.exec(value);
  if (!match) return null;

  const owner = (match[1] ?? '').toLowerCase();
  const repo = (match[2] ?? '').replace(/\.git$/i, '').toLowerCase();
  if (!owner || !repo) return null;
  return { owner, repo, url: `https://github.com/${owner}/${repo}`, directory };
}

// ---------------------------------------------------------------------------
// MCP derivation (plan section 7, rules evaluated in order).
// ---------------------------------------------------------------------------

interface McpSignals {
  isMcp: boolean;
  mcpRegistryName: string | null;
  hasCliBin: boolean;
}

function mcpSignals(latestDoc: Record<string, unknown> | null, doc: Record<string, unknown>): McpSignals {
  const deps = rec(latestDoc?.dependencies);
  const devDeps = rec(latestDoc?.devDependencies);
  const keys = binKeys(latestDoc?.bin);
  const mcpRegistryName = str(latestDoc?.mcpName) ?? str(doc.mcpName);

  let isMcp = false;
  if ((deps !== null && MCP_SDK in deps) || (devDeps !== null && MCP_SDK in devDeps)) {
    isMcp = true;
  } else if (mcpRegistryName !== null) {
    isMcp = true;
  } else if (keys.some((key) => /mcp/i.test(key))) {
    isMcp = true;
  }
  return { isMcp, mcpRegistryName, hasCliBin: keys.length > 0 };
}

// ---------------------------------------------------------------------------
// Upstream fetch with error mapping (plan section 3).
// ---------------------------------------------------------------------------

interface UpstreamJson {
  json: unknown;
  etag: string | null;
}

function upstreamError(status: number): ApiError {
  // Plan section 3: npm 404 passes through as our 404; npm 400 is treated as
  // UPSTREAM with status 502 (our requests are well formed by construction);
  // 5xx and network failures map to UPSTREAM 502.
  const body = npmError(status === 400 ? 502 : status);
  return new ApiError(body.error.code, body.error.message, httpStatusFor(body.error.code), body.error.retryAfter);
}

async function npmGet(url: string, revalidate: number): Promise<UpstreamJson> {
  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate } });
  } catch {
    throw upstreamError(502);
  }
  if (!res.ok) throw upstreamError(res.status);
  try {
    const json: unknown = await res.json();
    return { json, etag: res.headers.get('etag') };
  } catch {
    throw upstreamError(502);
  }
}

function registryPath(name: string): string {
  // Packument path needs the scope slash encoded as %2F (recon 01 gotcha 7).
  return name.split('/').map(encodeURIComponent).join('%2F');
}

function downloadsPath(name: string): string {
  // The downloads API accepts the literal scope slash.
  return name.split('/').map(encodeURIComponent).join('/');
}

// ---------------------------------------------------------------------------
// Packument fetch and transforms. Meta and versions share one fetch, so the
// Next data cache dedupes them (plan section 3).
// ---------------------------------------------------------------------------

interface PackumentResult {
  doc: Record<string, unknown>;
  etag: string | null;
}

async function fetchPackument(name: string): Promise<PackumentResult> {
  const { json, etag } = await npmGet(`${REGISTRY_HOST}/${registryPath(name)}`, NPM_REVALIDATE.meta);
  const doc = rec(json);
  if (!doc) throw upstreamError(502);
  return { doc, etag };
}

function packageMetaFromPackument(doc: Record<string, unknown>, requestedName: string): PackageMeta {
  const distTags = rec(doc['dist-tags']);
  const latest = str(distTags?.latest);
  const versions = rec(doc.versions);
  const time = rec(doc.time);
  const latestDoc = latest !== null ? rec(versions?.[latest]) : null;
  if (latest === null || latestDoc === null) throw upstreamError(502);

  const mcp = mcpSignals(latestDoc, doc);
  const deps = rec(latestDoc.dependencies);
  const dist = rec(latestDoc.dist);
  // time mixes created/modified with per version keys; count semver keys only.
  const versionCount = Object.keys(time ?? versions ?? {}).filter((key) => SEMVER_KEY.test(key)).length;

  return {
    name: str(doc.name) ?? str(latestDoc.name) ?? requestedName,
    description: str(doc.description) ?? str(latestDoc.description),
    latestVersion: latest,
    license: licenseOf(latestDoc),
    createdAt: str(time?.created),
    lastPublishAt: str(time?.[latest]),
    repo: parseRepoRef(doc.repository ?? latestDoc.repository),
    isMcp: mcp.isMcp,
    mcpRegistryName: mcp.mcpRegistryName,
    hasCliBin: mcp.hasCliBin,
    dependencyCount: deps ? Object.keys(deps).length : 0,
    unpackedSize: num(dist?.unpackedSize),
    versionCount,
  };
}

function versionEntries(doc: Record<string, unknown>): VersionEntry[] {
  const versions = rec(doc.versions);
  const time = rec(doc.time);
  const names = Object.keys(time ?? versions ?? {}).filter((key) => SEMVER_KEY.test(key));

  const entries: VersionEntry[] = names.map((version) => {
    const vdoc = rec(versions?.[version]);
    const deps = rec(vdoc?.dependencies);
    const devDeps = rec(vdoc?.devDependencies);
    const dist = rec(vdoc?.dist);
    const engines = rec(vdoc?.engines);
    return {
      version,
      publishedAt: str(time?.[version]),
      license: licenseOf(vdoc),
      dependencyCount: deps ? Object.keys(deps).length : 0,
      devDependencyCount: devDeps ? Object.keys(devDeps).length : 0,
      unpackedSize: num(dist?.unpackedSize),
      fileCount: num(dist?.fileCount),
      hasBin: binKeys(vdoc?.bin).length > 0,
      enginesNode: str(engines?.node),
    };
  });

  // Newest first; versions without a timestamp sort last with publishedAt null.
  entries.sort((a, b) => {
    if (a.publishedAt !== null && b.publishedAt !== null) return b.publishedAt.localeCompare(a.publishedAt);
    if (a.publishedAt !== null) return -1;
    if (b.publishedAt !== null) return 1;
    return 0;
  });
  return entries;
}

// ---------------------------------------------------------------------------
// Public server API. listScopePackages, getPackageMeta, and getDownloadSeries
// are also called directly by the server side prefetch (plan section 5).
// ---------------------------------------------------------------------------

export interface PackageMetaResult {
  meta: PackageMeta;
  etag: string | null;
}

export interface VersionPageResult {
  page: VersionPage;
  etag: string | null;
}

export async function listScopePackages(scope: string): Promise<ScopePackagesResponse> {
  // The scope: search qualifier is broken live (recon 01 gotcha 1), so the plan
  // uses a text search plus a client side prefix filter as the correctness gate.
  const prefix = `${scope.toLowerCase()}/`;
  const objects: unknown[] = [];
  let total = 0;

  for (let page = 0; page < SEARCH_MAX_PAGES; page += 1) {
    const from = objects.length;
    if (page > 0 && from >= total) break;
    const url = `${REGISTRY_HOST}/-/v1/search?text=${encodeURIComponent(scope)}&size=${SEARCH_PAGE_SIZE}&from=${from}`;
    const { json } = await npmGet(url, NPM_REVALIDATE.packages);
    const doc = rec(json);
    if (!doc) throw upstreamError(502);
    const batch = Array.isArray(doc.objects) ? doc.objects : [];
    objects.push(...batch);
    total = num(doc.total) ?? 0;
    if (batch.length === 0) break;
  }

  const packages: PackageSummary[] = [];
  for (const item of objects) {
    const obj = rec(item);
    const pkg = rec(obj?.package);
    const name = str(pkg?.name);
    if (!name || !name.toLowerCase().startsWith(prefix)) continue;
    const links = rec(pkg?.links);
    packages.push({
      name,
      version: str(pkg?.version) ?? '',
      description: str(pkg?.description),
      license: str(pkg?.license),
      lastPublishAt: str(pkg?.date),
      weeklyDownloads: num(rec(obj?.downloads)?.weekly) ?? 0,
      repositoryUrl: str(links?.repository),
    });
  }

  // Zero prefix matches is a valid empty result, not an error.
  return { scope, packages, total: packages.length, fetchedAt: new Date().toISOString() };
}

export async function getPackageMetaResult(name: string): Promise<PackageMetaResult> {
  const { doc, etag } = await fetchPackument(name);
  return { meta: packageMetaFromPackument(doc, name), etag };
}

export async function getPackageMeta(name: string): Promise<PackageMeta> {
  const { meta } = await getPackageMetaResult(name);
  return meta;
}

export async function getVersionPageResult(name: string, offset: number, limit: number): Promise<VersionPageResult> {
  const { doc, etag } = await fetchPackument(name);
  const entries = versionEntries(doc);
  const items = entries.slice(offset, offset + limit);
  const end = offset + items.length;
  const page: VersionPage = { items, total: entries.length, nextOffset: end < entries.length ? end : null };
  return { page, etag };
}

async function fetchRange(name: string, period: string, days: DownloadDays): Promise<DownloadSeries> {
  const { json } = await npmGet(`${DOWNLOADS_HOST}/downloads/range/${period}/${downloadsPath(name)}`, NPM_REVALIDATE.downloads);
  const doc = rec(json);
  if (!doc) throw upstreamError(502);
  const list = Array.isArray(doc.downloads) ? doc.downloads : [];

  const points: DownloadPoint[] = [];
  for (const item of list) {
    const entry = rec(item);
    const day = str(entry?.day);
    const downloads = num(entry?.downloads);
    if (day !== null && downloads !== null) points.push({ day, downloads });
  }
  const total = points.reduce((sum, point) => sum + point.downloads, 0);

  // start and end come from the API response, never from the request: the
  // range endpoint silently clamps and stats lag 1 to 2 days (recon 01).
  return {
    packageName: str(doc.package) ?? name,
    days,
    start: str(doc.start) ?? '',
    end: str(doc.end) ?? '',
    total,
    points,
  };
}

function ninetyDayStart(end: string): string {
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (Number.isNaN(endMs)) throw upstreamError(502);
  return new Date(endMs - NINETY_DAY_SPAN_MS).toISOString().slice(0, 10);
}

export async function getDownloadSeries(name: string, days: DownloadDays): Promise<DownloadSeries> {
  if (days === 7) return fetchRange(name, 'last-week', 7);
  if (days === 30) return fetchRange(name, 'last-month', 30);
  // No 90 day token exists (recon 01 gotcha 3): anchor a custom inclusive range
  // off the end day the API actually reports, never off Date.now().
  const probe = await fetchRange(name, 'last-week', 7);
  const start = ninetyDayStart(probe.end);
  return fetchRange(name, `${start}:${probe.end}`, 90);
}

// ---------------------------------------------------------------------------
// Route handler helpers: uniform cache headers and the plan section 3 error
// contract ({ error: { code, message, retryAfter } } with matching status).
// ---------------------------------------------------------------------------

function cacheControl(revalidate: number): string {
  return `public, s-maxage=${revalidate}, stale-while-revalidate=${revalidate * 2}`;
}

export function jsonOk(data: unknown, revalidate: number, etag?: string | null): NextResponse {
  const headers = new Headers({ 'Cache-Control': cacheControl(revalidate) });
  if (etag) headers.set('ETag', etag);
  return NextResponse.json(data, { headers });
}

export function notModifiedIfMatch(request: NextRequest, revalidate: number, etag: string | null): NextResponse | null {
  if (!etag) return null;
  const candidate = request.headers.get('if-none-match');
  if (candidate === null || candidate.trim() !== etag) return null;
  const headers = new Headers({ 'Cache-Control': cacheControl(revalidate), ETag: etag });
  return new NextResponse(null, { status: 304, headers });
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (isApiError(error)) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, retryAfter: error.retryAfter },
    };
    return NextResponse.json(body, { status: error.status });
  }
  return NextResponse.json(npmError(502), { status: 502 });
}
