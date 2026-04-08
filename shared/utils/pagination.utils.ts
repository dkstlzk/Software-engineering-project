/**
 * Pagination utilities for consistent paginated responses across the application
 */

// Constants
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// Types
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

/**
 * Apply limit and offset to a Drizzle query
 * @param query - Drizzle query builder instance
 * @param params - Pagination parameters
 * @returns Query with limit and offset applied
 */
export function paginate<T>(query: T, params: PaginationParams): T {
  const { limit, offset } = params;
  
  // Ensure limit doesn't exceed MAX_LIMIT
  const safeLimit = Math.min(limit, MAX_LIMIT);
  
  // Apply limit and offset to the query
  // TypeScript doesn't know about Drizzle's limit/offset methods,
  // so we cast to any and back
  return (query as any).limit(safeLimit).offset(offset) as T;
}

/**
 * Create a standardized paginated response
 * @param data - The data array for the current page
 * @param total - Total count of items across all pages
 * @param params - Pagination parameters used for the query
 * @returns Standardized paginated response object
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const { limit, offset } = params;
  const safeLimit = Math.min(limit, MAX_LIMIT);
  
  return {
    data,
    pagination: {
      limit: safeLimit,
      offset,
      total,
      hasMore: offset + data.length < total,
    },
  };
}

/**
 * Parse and validate pagination parameters from query strings or request objects
 * @param limit - Requested limit (defaults to DEFAULT_LIMIT)
 * @param offset - Requested offset (defaults to 0)
 * @returns Validated pagination parameters
 */
export function parsePaginationParams(
  limit?: number | string,
  offset?: number | string
): PaginationParams {
  const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
  const parsedOffset = typeof offset === 'string' ? parseInt(offset, 10) : offset;
  
  return {
    limit: Math.min(
      Math.max(parsedLimit || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    ),
    offset: Math.max(parsedOffset || 0, 0),
  };
}
