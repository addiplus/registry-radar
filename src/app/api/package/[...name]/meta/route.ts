import type { NextRequest } from 'next/server';
import {
  NPM_REVALIDATE,
  apiErrorResponse,
  getPackageMetaResult,
  jsonOk,
  notModifiedIfMatch,
} from '@/lib/server/npm';

interface RouteContext {
  params: Promise<{ name: string[] }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { name } = await context.params;
    const { meta, etag } = await getPackageMetaResult(name.join('/'));
    // ETag passthrough (plan section 3): the body is a deterministic transform
    // of the packument, so the upstream validator stays honest on cache hits.
    const notModified = notModifiedIfMatch(request, NPM_REVALIDATE.meta, etag);
    if (notModified) return notModified;
    return jsonOk(meta, NPM_REVALIDATE.meta, etag);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
