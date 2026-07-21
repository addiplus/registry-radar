import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ApiError, isApiError } from '@/lib/api-error';
import {
  buildNinetyDayRange,
  toDownloadSeries,
  type NpmDownloadsRange,
} from '@/lib/transforms/downloads';
import { httpStatusFor, npmError } from '@/lib/transforms/errors';
import {
  paginateVersions,
  toPackageMeta,
  versionHistory,
  type Packument,
} from '@/lib/transforms/packument';
import type {
  ApiErrorBody,
  DownloadDays,
  DownloadSeries,
  PackageMeta,
  PackageSummary,
  ScopePackagesResponse,
  VersionPage,
} from '@/lib/types';

// Upstream hosts (recon 01): registry.npmjs.org for metadata, api.npmjs.org for download stats.
const REGISTRY_HOST = 'https://registry.npmjs.org';
const DOWNLOADS_HOST = 'https://api.npmjs.org';

// Upstream fetch data-cache TTLs. Route response Cache-Control is deliberately
// shorter and lives in NPM_CACHE_CONTROL below (security fix G1): the CDN
// revalidates against these routes, which the fetch cache then answers.
export const NPM_REVALIDATE = {
  packages: 1800,
  meta: 1800,
  versions: 1800,
  downloads: 3600,
} as const;

const SEARCH_PAGE_SIZE = 250;
const SEARCH_MAX_PAGES = 4;

// ---------------------------------------------------------------------------
// JSON narrowing helpers. Upstream payloads are untyped, so every field is
// read through these instead of being trusted (recon 01 gotcha 8). Mapping
// itself lives in src/lib/transforms/ (the tested truth); these helpers remain
// for the search payload, which has no transform twin, and for the boundary
// shape checks before values are cast into the transform input types.
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
// Packument fetch. Meta and versions share one fetch, so the Next data cache
// dedupes them (plan section 3). All packument mapping is delegated to the
// shared transforms; only deliberate server-only guards live here.
// ---------------------------------------------------------------------------

interface PackumentResult {
  doc: Packument;
  etag: string | null;
}

async function fetchPackument(name: string): Promise<PackumentResult> {
  const { json, etag } = await npmGet(`${REGISTRY_HOST}/${registryPath(name)}`, NPM_REVALIDATE.meta);
  if (rec(json) === null) throw upstreamError(502);
  // Shape-checked above; from here the payload is read through the Packument
  // lens, whose every field is optional so junk reads as undefined.
  return { doc: json as Packument, etag };
}

function metaFromPackument(doc: Packument, requestedName: string): PackageMeta {
  // Deliberate server contract kept around the transform: a packument without
  // a usable dist-tags.latest is a malformed upstream response (502 UPSTREAM),
  // not a renderable package. The transform throws a bare Error here instead,
  // which would not carry the ApiError status/code contract.
  const latest = str(rec(doc['dist-tags'])?.latest);
  const latestDoc = latest !== null ? rec(doc.versions?.[latest]) : null;
  if (latest === null || latestDoc === null) throw upstreamError(502);
  const meta = toPackageMeta(doc);
  // Registry packuments always carry name; when one does not, the requested
  // name is a better fallback than the transform's ''.
  return meta.name !== '' ? meta : { ...meta, name: requestedName };
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
  return { meta: metaFromPackument(doc, name), etag };
}

export async function getPackageMeta(name: string): Promise<PackageMeta> {
  const { meta } = await getPackageMetaResult(name);
  return meta;
}

export async function getVersionPageResult(name: string, offset: number, limit: number): Promise<VersionPageResult> {
  const { doc, etag } = await fetchPackument(name);
  const page = paginateVersions(versionHistory(doc), offset, limit);
  return { page, etag };
}

async function fetchRange(name: string, period: string, days: DownloadDays): Promise<DownloadSeries> {
  const { json } = await npmGet(`${DOWNLOADS_HOST}/downloads/range/${period}/${downloadsPath(name)}`, NPM_REVALIDATE.downloads);
  if (rec(json) === null) throw upstreamError(502);
  // start and end come from the API response, never from the request: the
  // range endpoint silently clamps and stats lag 1 to 2 days (recon 01).
  const series = toDownloadSeries(json as NpmDownloadsRange, days);
  // The payload normally echoes the package name; fall back to the request.
  return series.packageName !== '' ? series : { ...series, packageName: name };
}

export async function getDownloadSeries(name: string, days: DownloadDays): Promise<DownloadSeries> {
  if (days === 7) return fetchRange(name, 'last-week', 7);
  if (days === 30) return fetchRange(name, 'last-month', 30);
  // No 90 day token exists (recon 01 gotcha 3): anchor a custom inclusive range
  // off the end day the API actually reports, never off Date.now().
  const probe = await fetchRange(name, 'last-week', 7);
  if (Number.isNaN(Date.parse(`${probe.end}T00:00:00.000Z`))) throw upstreamError(502);
  const range = buildNinetyDayRange(probe.end);
  return fetchRange(name, `${range.start}:${range.end}`, 90);
}

// ---------------------------------------------------------------------------
// Route handler helpers: uniform cache headers and the plan section 3 error
// contract ({ error: { code, message, retryAfter } } with matching status).
// ---------------------------------------------------------------------------

// Successful npm-backed GETs are CDN-cacheable for 300s (npm itself caches
// registry responses for 300s) with stale-while-revalidate so the CDN absorbs
// repeat traffic. Errors are explicitly no-store (security fix G1).
const NPM_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export function jsonOk(data: unknown, etag?: string | null): NextResponse {
  const headers = new Headers({ 'Cache-Control': NPM_CACHE_CONTROL });
  if (etag) headers.set('ETag', etag);
  return NextResponse.json(data, { headers });
}

export function notModifiedIfMatch(request: NextRequest, etag: string | null): NextResponse | null {
  if (!etag) return null;
  const candidate = request.headers.get('if-none-match');
  if (candidate === null || candidate.trim() !== etag) return null;
  const headers = new Headers({ 'Cache-Control': NPM_CACHE_CONTROL, ETag: etag });
  return new NextResponse(null, { status: 304, headers });
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (isApiError(error)) {
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, retryAfter: error.retryAfter },
    };
    return NextResponse.json(body, { status: error.status, headers: NO_STORE_HEADERS });
  }
  return NextResponse.json(npmError(502), { status: 502, headers: NO_STORE_HEADERS });
}
