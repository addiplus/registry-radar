import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-error';
import { VERSIONS_PAGE_SIZE } from '@/lib/constants';
import {
  apiErrorResponse,
  getVersionPageResult,
  jsonOk,
  notModifiedIfMatch,
} from '@/lib/server/npm';
import { clientIp, getNpmRateLimiter, rateLimitExceededResponse } from '@/lib/server/rate-limit';
import {
  isValidNpmName,
  parseBoundedInt,
  VERSIONS_LIMIT_MAX,
  VERSIONS_OFFSET_MAX,
} from '@/lib/server/validate';

interface RouteContext {
  params: Promise<{ name: string[] }>;
}

const PAGING_MESSAGE = 'Invalid offset or limit. Use whole numbers, limit between 1 and 50.';

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const packageName = name.join('/');
    if (!isValidNpmName(packageName)) {
      throw new ApiError('INVALID_INPUT', 'Enter a valid npm package name.', 400);
    }
    const searchParams = request.nextUrl.searchParams;
    const offset = parseBoundedInt(searchParams.get('offset'), 0, 0, VERSIONS_OFFSET_MAX, PAGING_MESSAGE);
    const limit = parseBoundedInt(searchParams.get('limit'), VERSIONS_PAGE_SIZE, 1, VERSIONS_LIMIT_MAX, PAGING_MESSAGE);
    const rateLimit = getNpmRateLimiter().check(clientIp(request));
    if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit);
    const { page, etag } = await getVersionPageResult(packageName, offset, limit);
    const notModified = notModifiedIfMatch(request, etag);
    if (notModified) return notModified;
    return jsonOk(page, etag);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
