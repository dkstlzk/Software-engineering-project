import { Router } from "express";
import { eq } from "drizzle-orm";
import { authMiddleware } from "../../../middleware/auth";
import { requireRole } from "../../../middleware/rbac";
import { requireBookingsUnfrozen } from "../../../middleware/bookingFreeze";
import { validate } from "../../../api/middleware/validation.middleware";
import { idParamSchema } from "../../../shared/validators/schemas/common.schemas";
import { bookingEditRequests } from "../../../db/schema";
import { db } from "../../../db";
import { approveEditRequest, rejectEditRequest } from "../../../services/editBookingService";

const router = Router();

router.get("/", authMiddleware, async (req, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const whereClause =
      user.role === "ADMIN" || user.role === "STAFF"
        ? undefined
        : eq(bookingEditRequests.requestedBy, user.id);

    const query = db
      .select()
      .from(bookingEditRequests);

    const rows = whereClause
      ? await query.where(whereClause)
      : await query;

    return res.json(rows);
  } catch (err) {
    console.error("DB ERROR:", err);
    return res.status(500).json({
      message: "Failed to fetch booking edit requests",
    });
  }
});

router.post(
  "/:id/approve",
  authMiddleware,
  requireRole(["ADMIN", "STAFF"]),
  requireBookingsUnfrozen(),
  validate({ params: idParamSchema }),
  async (req, res) => {
    try {
      const requestId = Number(req.params.id);

      const result = await approveEditRequest(requestId, { id: req.user!.id });

      if (!result.ok) {
        return res.status(result.error.status).json({
          message: result.error.message,
          code: result.error.code,
        });
      }

      return res.json(result.data);
    } catch (err) {
      console.error("ERROR:", err);
      return res.status(500).json({
        message: err instanceof Error ? err.message : "Internal server error",
      });
    }
  },
);

router.post(
  "/:id/reject",
  authMiddleware,
  requireRole(["ADMIN", "STAFF"]),
  requireBookingsUnfrozen(),
  validate({ params: idParamSchema }),
  async (req, res) => {
    try {
      const requestId = Number(req.params.id);

      const result = await rejectEditRequest(requestId, { id: req.user!.id });

      if (!result.ok) {
        return res.status(result.error.status).json({
          message: result.error.message,
          code: result.error.code,
        });
      }

      return res.json(result.data);
    } catch (err) {
      console.error("ERROR:", err);
      return res.status(500).json({
        message: err instanceof Error ? err.message : "Internal server error",
      });
    }
  },
);

export default router;
