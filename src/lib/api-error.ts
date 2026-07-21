import type { ApiErrorCode } from './types';

// Thrown by fetchers and server helpers; route handlers map it to ApiErrorBody.
export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number,
    public retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
