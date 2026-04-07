/**
 * Booking Freeze Middleware
 *
 * Middleware to block booking mutations when a timetable import commit is in progress.
 * Returns HTTP 423 (Locked) with detailed reason when bookings are frozen.
 */

import { Request, Response, NextFunction } from "express";
import { checkFreezeBlock } from "../modules/timetable/services/bookingFreezeService";
import logger from "../shared/utils/logger";

/**
 * Middleware that blocks the request if bookings are frozen.
 * Use this on routes that modify bookings (create, update, delete, approve).
 */
export function requireBookingsUnfrozen() {
  return (req: Request, res: Response, next: NextFunction) => {
    const freezeBlock = checkFreezeBlock();

    if (freezeBlock) {
      logger.info("Booking operation blocked due to freeze", {
        method: req.method,
        path: req.path,
        userId: req.user?.id,
        frozenByBatchId: freezeBlock.freezeInfo.batchId,
        frozenByUserId: freezeBlock.freezeInfo.userId,
      });

      return res.status(freezeBlock.status).json({
        error: freezeBlock.code,
        message: freezeBlock.message,
        freezeInfo: {
          batchId: freezeBlock.freezeInfo.batchId,
          frozenBy: freezeBlock.freezeInfo.userName,
          startedAt: freezeBlock.freezeInfo.startedAt.toISOString(),
        },
      });
    }

    next();
  };
}

/**
 * Helper to check freeze status without blocking (for informational purposes)
 */
export function getFreezeStatus() {
  return checkFreezeBlock();
}
