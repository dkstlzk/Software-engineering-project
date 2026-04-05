import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

interface ValidationSchema {
  params?: ZodSchema;
  query?: ZodSchema;
  body?: ZodSchema;
}

export function validate(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schema.params) {
        const parsedParams = schema.params.parse(req.params);
        Object.keys(req.params).forEach(key => delete req.params[key]);
        Object.assign(req.params, parsedParams);
      }

      if (schema.query) {
        const parsedQuery = schema.query.parse(req.query);
        // In Express 5, req.query is read-only but we can mutate its properties
        const queryObj = req.query as Record<string, any>;
        Object.keys(queryObj).forEach(key => delete queryObj[key]);
        Object.assign(queryObj, parsedQuery);
      }

      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');
        res.status(400).json({
          error: 'Validation failed',
          message: message || 'Invalid request data',
          details: error.errors,
        });
      } else {
        next(error);
      }
    }
  };
}
