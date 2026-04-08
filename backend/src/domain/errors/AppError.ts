/**
 * Base application error class for all custom errors.
 * Extends the native Error class and adds application-specific properties.
 */
export class AppError extends Error {
  /**
   * HTTP status code for the error response
   */
  public readonly statusCode: number;

  /**
   * Machine-readable error code for error identification
   */
  public readonly code: string;

  /**
   * Human-readable error message
   */
  public readonly message: string;

  /**
   * Flag indicating if the error is operational (known error) vs programming error
   */
  public readonly isOperational: boolean;

  /**
   * Creates an instance of AppError
   * @param statusCode - HTTP status code
   * @param code - Machine-readable error code
   * @param message - Human-readable error message
   * @param isOperational - Whether this is an operational error (default: true)
   */
  constructor(
    statusCode: number,
    code: string,
    message: string,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.message = message;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when request validation fails.
 * Used for invalid input parameters or malformed requests.
 *
 * @example
 * throw new ValidationError('Email format is invalid');
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Error thrown when authentication fails or credentials are missing.
 * Typically returned for unauthenticated requests.
 *
 * @example
 * throw new UnauthorizedError('Invalid or expired token');
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Error thrown when a user lacks permissions to access a resource.
 * Used when the user is authenticated but not authorized for the action.
 *
 * @example
 * throw new ForbiddenError('You do not have permission to delete this resource');
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, 'FORBIDDEN', message);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Error thrown when a requested resource is not found.
 * Used for requests to non-existent resources or endpoints.
 *
 * @example
 * throw new NotFoundError('User with id 123 not found');
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Error thrown when there is a conflict with the current state of the resource.
 * Typically used for duplicate entries or version conflicts.
 *
 * @example
 * throw new ConflictError('Email already exists');
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Conflict with current resource state') {
    super(409, 'CONFLICT', message);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Error thrown when a client exceeds rate limits.
 * Used to indicate too many requests from a single client.
 *
 * @example
 * throw new RateLimitError('Too many login attempts, please try again later');
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(429, 'RATE_LIMIT_EXCEEDED', message);
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
