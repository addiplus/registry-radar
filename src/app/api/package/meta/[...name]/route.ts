import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-error';
import {
  apiErrorResponse,
  getPackageMetaResult,
  jsonOk,
  notModifiedIfMatch,
} from '@/lib/server/npm';
import { clientIp, getNpmRateLimiter, rateLimitExceededResponse } from '@/lib/server/rate-limit';
import { isValidNpmName } from '@/lib/server/validate';

interface RouteContext {
  params: Promise<{ name: string[] }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const packageName = name.join('/');
    if (!isValidNpmName(packageName)) {
      throw new ApiError('INVALID_INPUT', 'Enter a valid npm package name.', 400);
    }
    const limit = getNpmRateLimiter().check(clientIp(request));
    if (!limit.allowed) return rateLimitExceededResponse(limit);
    const { meta, etag } = await getPackageMetaResult(packageName);
    // ETag passthrough (plan section 3): the body is a deterministic transform
    // of the packument, so the upstream validator stays honest on cache hits.
    const notModified = notModifiedIfMatch(request, etag);
    if (notModified) return notModified;
    return jsonOk(meta, etag);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
