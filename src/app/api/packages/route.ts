import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api-error';
import { NPM_REVALIDATE, apiErrorResponse, jsonOk, listScopePackages } from '@/lib/server/npm';

// Plan section 3: scope is required and must match this pattern, else 400 INVALID_INPUT.
const SCOPE_PATTERN = /^@[a-z0-9][\w.-]*$/i;

export async function GET(request: NextRequest) {
  try {
    const scope = request.nextUrl.searchParams.get('scope');
    if (scope === null || !SCOPE_PATTERN.test(scope)) {
      throw new ApiError('INVALID_INPUT', 'Provide a valid npm scope, for example @example.', 400);
    }
    const data = await listScopePackages(scope);
    return jsonOk(data, NPM_REVALIDATE.packages);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
