export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
  pagination?: Pagination;
  meta?: Record<string, unknown>;
}

export function successResponse<T>(data: T, meta?: Record<string, unknown>): ApiResponse<T> {
  return {
    data,
    ...(meta && { meta }),
  };
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown
): ApiResponse<never> {
  return {
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
}

export function paginatedResponse<T>(
  data: T[],
  pagination: Pagination
): ApiResponse<T[]> {
  return {
    data,
    pagination,
  };
}
