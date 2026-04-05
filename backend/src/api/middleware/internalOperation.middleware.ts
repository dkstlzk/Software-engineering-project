import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to mark internal operations that should bypass rate limiting.
 * Internal operations are trusted system operations (e.g., timetable batch commits)
 * that generate many requests internally but represent a single user action.
 */
export function markInternalOperation(req: Request, res: Response, next: NextFunction) {
  // Mark timetable commit operations as internal - these are batch operations
  // that process many bookings internally but represent a single user commit action
  if (req.method === 'POST' && req.path.includes('/imports/') && req.path.endsWith('/commit')) {
    (req as any).isInternalOperation = true;
  }

  next();
}
