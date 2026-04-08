/**
 * Machine-readable error codes and their descriptions.
 * Used for consistent error identification across the application.
 */
export const ERROR_CODES = {
  /**
   * Validation error - occurs when request data fails validation
   */
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    description: 'Request validation failed. Check the provided parameters.',
  },

  /**
   * Unauthorized error - occurs when authentication is required but missing or invalid
   */
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    statusCode: 401,
    description: 'Authentication is required. Please provide valid credentials.',
  },

  /**
   * Forbidden error - occurs when user is authenticated but lacks permissions
   */
  FORBIDDEN: {
    code: 'FORBIDDEN',
    statusCode: 403,
    description: 'You do not have permission to access this resource.',
  },

  /**
   * Not found error - occurs when a requested resource does not exist
   */
  NOT_FOUND: {
    code: 'NOT_FOUND',
    statusCode: 404,
    description: 'The requested resource was not found.',
  },

  /**
   * Conflict error - occurs when the request conflicts with the current state
   */
  CONFLICT: {
    code: 'CONFLICT',
    statusCode: 409,
    description: 'The request conflicts with the current state of the resource.',
  },

  /**
   * Rate limit exceeded - occurs when client exceeds rate limits
   */
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    statusCode: 429,
    description: 'Too many requests. Please try again later.',
  },
} as const;

/**
 * Type for error code keys
 */
export type ErrorCodeKey = keyof typeof ERROR_CODES;

/**
 * Type for error code values
 */
export type ErrorCode = (typeof ERROR_CODES)[ErrorCodeKey];
