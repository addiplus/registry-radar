import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-error';
import type { DownloadDays } from '@/lib/types';
import { NPM_REVALIDATE, apiErrorResponse, getDownloadSeries, jsonOk } from '@/lib/server/npm';

interface RouteContext {
  params: Promise<{ name: string[] }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const raw = request.nextUrl.searchParams.get('range');
    if (raw !== '7' && raw !== '30' && raw !== '90') {
      throw new ApiError('INVALID_INPUT', 'Range must be one of 7, 30, or 90.', 400);
    }
    const days: DownloadDays = raw === '7' ? 7 : raw === '30' ? 30 : 90;
    const series = await getDownloadSeries(name.join('/'), days);
    return jsonOk(series, NPM_REVALIDATE.downloads);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
