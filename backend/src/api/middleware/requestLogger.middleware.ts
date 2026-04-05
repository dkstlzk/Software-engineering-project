import { Request, Response, NextFunction } from 'express';
import logger from '../../shared/utils/logger';

// List of sensitive keys to exclude from logging
const SENSITIVE_KEYS = ['password', 'token', 'authorization', 'secret', 'key', 'api_key', 'apikey', 'access_token', 'refresh_token'];

/**
 * Check if a key contains sensitive data
 */
const isSensitiveKey = (key: string): boolean => {
  return SENSITIVE_KEYS.some(sensitiveKey => 
    key.toLowerCase().includes(sensitiveKey)
  );
};

/**
 * Sanitize an object by removing sensitive keys
 */
const sanitize = (obj: any, depth = 0): any => {
  if (depth > 5) return obj; // Prevent deep recursion
  if (!obj || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item, depth + 1));
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitize(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Request logger middleware
 * Logs incoming requests with method, path, query params, user ID
 * Logs responses with status code and duration
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Record request start time
  const startTime = Date.now();
  
  // Get request details
  const method = req.method;
  const path = req.path;
  const query = Object.keys(req.query).length > 0 ? req.query : {};
  const userId = (req.user as any)?.id ?? null;
  
  // Sanitize sensitive query params
  const sanitizedQuery = sanitize(query);
  
  // Override res.end to capture response
  const originalEnd = res.end;
  
  res.end = function(chunk?: any, encoding?: any): Response {
    // Calculate duration
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Format log message
    const userStr = userId ? `User:${userId}` : '';
    const queryStr = Object.keys(sanitizedQuery).length > 0 ? ` Query:${JSON.stringify(sanitizedQuery)}` : ' Query:{}';
    
    const logMessage = `[${method} ${path}] ${userStr}${queryStr} - ${statusCode} (${duration}ms)`.replace(/  +/g, ' ').trim();
    
    // Log based on status code
    if (statusCode >= 500) {
      logger.error(logMessage);
    } else if (statusCode >= 400) {
      logger.warn(logMessage);
    } else {
      logger.info(logMessage);
    }
    
    // Call original end
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
};
