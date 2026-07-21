import { ApiError } from '@/lib/api-error';

// ---------------------------------------------------------------------------
// Input validation shared by every API route (security fix G1). Anything that
// fails here is a 400 INVALID_INPUT in the ApiErrorBody contract, thrown as an
// ApiError so the route handlers' existing catch blocks map it unchanged.
// ---------------------------------------------------------------------------

// npm package name rules (package-name-guidelines): optional @scope/ prefix,
// each segment starts with an alphanumeric followed by word chars, dots, or
// hyphens; 214 chars total. Uppercase tolerated for legacy registry names.
export const NPM_NAME_MAX_LENGTH = 214;
const NPM_NAME_PATTERN = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
const NPM_SCOPE_PATTERN = /^@[a-z0-9][\w.-]*$/i;

export function isValidNpmName(name: string): boolean {
  return name.length > 0 && name.length <= NPM_NAME_MAX_LENGTH && NPM_NAME_PATTERN.test(name);
}

export function isValidNpmScope(scope: string): boolean {
  return scope.length > 1 && scope.length <= NPM_NAME_MAX_LENGTH && NPM_SCOPE_PATTERN.test(scope);
}

// GitHub login rules: alphanumerics or single hyphens, no leading/trailing
// hyphen, 1 to 39 characters. Owners follow the same rules.
const GITHUB_USERNAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
// Repo names additionally allow dots and underscores; GitHub caps at 100.
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

export function isValidGitHubUsername(name: string): boolean {
  return GITHUB_USERNAME_PATTERN.test(name);
}

export function isValidGitHubRepoName(name: string): boolean {
  return GITHUB_REPO_PATTERN.test(name);
}

// Numeric bounds for paging params. A generous page cap keeps "walk every
// page" abuse from turning one request into unbounded upstream fan-out.
export const GITHUB_PAGE_MAX = 100;
export const VERSIONS_LIMIT_MAX = 50;
export const VERSIONS_OFFSET_MAX = 100_000;

export function parseBoundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
  message: string,
): number {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new ApiError('INVALID_INPUT', message, 400);
  const value = Number(raw);
  if (value < min || value > max) throw new ApiError('INVALID_INPUT', message, 400);
  return value;
}

// ---------------------------------------------------------------------------
// Watchlist abuse caps (security fix G1, review F2/F5): shared unauthenticated
// store, so growth and body size are bounded in the route handlers, which
// covers both store implementations. 413 still uses the ApiErrorBody contract.
// ---------------------------------------------------------------------------

export const WATCHLIST_MAX_ENTRIES = 100;
export const WATCHLIST_NOTE_MAX_CHARS = 500;
export const MAX_JSON_BODY_BYTES = 16 * 1024;

const BODY_TOO_LARGE_MESSAGE = 'Request body too large.';

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

// Reads a JSON body with a hard 16kb cap. Oversize throws 413; unparseable
// JSON returns null so callers keep their existing INVALID_INPUT mapping.
export async function readBoundedJsonBody(request: Request): Promise<unknown> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > MAX_JSON_BODY_BYTES) {
      throw new ApiError('INVALID_INPUT', BODY_TOO_LARGE_MESSAGE, 413);
    }
  }
  const text = await request.text();
  if (byteLength(text) > MAX_JSON_BODY_BYTES) {
    throw new ApiError('INVALID_INPUT', BODY_TOO_LARGE_MESSAGE, 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
