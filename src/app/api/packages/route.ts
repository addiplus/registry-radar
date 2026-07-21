import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-error';
import { apiErrorResponse, jsonOk, listScopePackages } from '@/lib/server/npm';
import { clientIp, getNpmRateLimiter, rateLimitExceededResponse } from '@/lib/server/rate-limit';
import { isValidNpmScope } from '@/lib/server/validate';

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope');
    if (scope === null || !isValidNpmScope(scope)) {
      throw new ApiError('INVALID_INPUT', 'Provide a valid npm scope, for example @example.', 400);
    }
    const limit = getNpmRateLimiter().check(clientIp(request));
    if (!limit.allowed) return rateLimitExceededResponse(limit);
    const data = await listScopePackages(scope);
    return jsonOk(data);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
