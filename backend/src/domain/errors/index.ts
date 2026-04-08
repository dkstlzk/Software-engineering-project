// Custom error classes for domain-specific exceptions
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from './AppError';

export { ERROR_CODES } from './errorCodes';
export type { ErrorCodeKey, ErrorCode } from './errorCodes';
