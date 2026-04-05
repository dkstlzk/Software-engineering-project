import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../domain/errors/AppError';
import logger from '../../shared/utils/logger';

/**
 * Global error handler middleware for Express
 * Handles both AppError (known/operational errors) and unexpected errors
 *
 * @param err - The error object
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Log error with context
  logError(err, req);

  if (err instanceof AppError) {
    // Handle known application errors
    const response: Record<string, unknown> = {
      message: err.message,
      error: {
        code: err.code,
        message: err.message,
      },
    };

    if (isDevelopment) {
      response.stack = err.stack;
    }

    res.status(err.statusCode).json(response);
  } else {
    // Handle unexpected errors
    const fallbackMessage = 'An unexpected error occurred. Please try again later.';
    const message = err.message?.trim() ? err.message : fallbackMessage;

    const response: Record<string, unknown> = {
      message,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
      },
    };

    if (isDevelopment) {
      response.stack = err.stack;
      response.details = err.message;
    }

    res.status(500).json(response);
  }
}

/**
 * Logs error with request context
 * @param err - The error object
 * @param req - Express request object
 */
function logError(err: Error | AppError, req: Request): void {
  // Extract correlation ID from common headers or generate one
  const correlationId = 
    req.get('x-correlation-id') || 
    req.get('x-request-id') || 
    req.get('request-id') ||
    (req as any).id ||
    null;

  const context = {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.id || null,
    correlationId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };

  if (err instanceof AppError) {
    const level = err.isOperational ? 'warn' : 'error';
    logger[level as keyof typeof logger]('Error occurred', {
      ...context,
      code: err.code,
      statusCode: err.statusCode,
      isOperational: err.isOperational,
    });
  } else {
    logger.error('Unexpected error', {
      ...context,
      name: err.name,
    });
  }
}
