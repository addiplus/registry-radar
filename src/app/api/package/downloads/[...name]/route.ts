import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-error';
import type { DownloadDays } from '@/lib/types';
import { apiErrorResponse, getDownloadSeries, jsonOk } from '@/lib/server/npm';
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
    const raw = request.nextUrl.searchParams.get('range');
    if (raw !== '7' && raw !== '30' && raw !== '90') {
      throw new ApiError('INVALID_INPUT', 'Range must be one of 7, 30, or 90.', 400);
    }
    const limit = getNpmRateLimiter().check(clientIp(request));
    if (!limit.allowed) return rateLimitExceededResponse(limit);
    const days: DownloadDays = raw === '7' ? 7 : raw === '30' ? 30 : 90;
    const series = await getDownloadSeries(packageName, days);
    return jsonOk(series);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
