import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-error';
import { VERSIONS_PAGE_SIZE } from '@/lib/constants';
import {
  NPM_REVALIDATE,
  apiErrorResponse,
  getVersionPageResult,
  jsonOk,
  notModifiedIfMatch,
} from '@/lib/server/npm';

interface RouteContext {
  params: Promise<{ name: string[] }>;
}

const LIMIT_MAX = 50;
const PAGING_MESSAGE = 'Invalid offset or limit. Use whole numbers, limit between 1 and 50.';

function parsePaging(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) throw new ApiError('INVALID_INPUT', PAGING_MESSAGE, 400);
  const value = Number(raw);
  if (value < min || value > max) throw new ApiError('INVALID_INPUT', PAGING_MESSAGE, 400);
  return value;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const searchParams = request.nextUrl.searchParams;
    const offset = parsePaging(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = parsePaging(searchParams.get('limit'), VERSIONS_PAGE_SIZE, 1, LIMIT_MAX);
    const { page, etag } = await getVersionPageResult(name.join('/'), offset, limit);
    const notModified = notModifiedIfMatch(request, NPM_REVALIDATE.versions, etag);
    if (notModified) return notModified;
    return jsonOk(page, NPM_REVALIDATE.versions, etag);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
