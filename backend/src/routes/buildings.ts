import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { buildings, rooms } from "../db/schema";
import { authMiddleware } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import {
  getAssignedBuildingIdsForStaff,
  isBuildingAssignedToStaff,
} from "../services/staffBuildingScope";

const router = Router();

router.get("/:id/rooms", authMiddleware, async (req, res) => {
  try {
    const buildingId = Number(req.params.id);

    if (!Number.isInteger(buildingId) || buildingId <= 0) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    if (
      req.user?.role === "STAFF" &&
      !(await isBuildingAssignedToStaff(req.user.id, buildingId))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const building = await db
      .select({ id: buildings.id })
      .from(buildings)
      .where(eq(buildings.id, buildingId))
      .limit(1);

    if (building.length === 0) {
      return res.status(404).json({ error: "Building not found" });
    }

    const result = await db
      .select()
      .from(rooms)
      .where(eq(rooms.buildingId, buildingId));

    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const buildingId = Number(req.params.id);

    if (!Number.isInteger(buildingId) || buildingId <= 0) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    if (
      req.user?.role === "STAFF" &&
      !(await isBuildingAssignedToStaff(req.user.id, buildingId))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await db
      .select()
      .from(buildings)
      .where(eq(buildings.id, buildingId))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: "Building not found" });
    }

    return res.json(result[0]);
  } catch {
    return res.status(500).json({ error: "Failed to fetch building" });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    if (req.user?.role === "STAFF") {
      const assignedBuildingIds = await getAssignedBuildingIdsForStaff(req.user.id);

      if (assignedBuildingIds.length === 0) {
        return res.json({ data: [] });
      }

      const result = await db
        .select()
        .from(buildings)
        .where(inArray(buildings.id, assignedBuildingIds));

      return res.json({ data: result });
    }

    const result = await db.select().from(buildings);
    return res.json({ data: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to fetch buildings" });
  }
});

router.post("/", authMiddleware, requireRole("ADMIN"), async (req, res) => {
  try {
    const name = req.body?.name?.trim();

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await db
      .insert(buildings)
      .values({ name })
      .returning();

    return res.json({
      message: "Building created",
      data: result[0],
    });
  } catch (error: any) {
    console.error(error);

    if (error?.cause?.code === "23505") {
      return res.status(409).json({ error: "Building already exists" });
    }

    return res.status(500).json({ error: "Insert failed" });
  }
});

router.delete("/:id", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const buildingId = Number(req.params.id);

    if (!Number.isInteger(buildingId) || buildingId <= 0) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    if (
      req.user?.role === "STAFF" &&
      !(await isBuildingAssignedToStaff(req.user.id, buildingId))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await db
      .delete(buildings)
      .where(eq(buildings.id, buildingId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: "Building not found" });
    }

    return res.json({ message: "Building deleted" });
  } catch (error: any) {
    console.error(error);

    if (error?.cause?.code === "23503") {
      return res.status(409).json({
        error: "Cannot delete building with existing rooms",
      });
    }

    return res.status(500).json({ error: "Delete failed" });
  }
});

router.patch("/:id", authMiddleware, requireRole(["ADMIN", "STAFF"]), async (req, res) => {
  try {
    const buildingId = Number(req.params.id);
    const name = req.body?.name?.trim();

    if (!Number.isInteger(buildingId) || buildingId <= 0) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (
      req.user?.role === "STAFF" &&
      !(await isBuildingAssignedToStaff(req.user.id, buildingId))
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const result = await db
      .update(buildings)
      .set({ name })
      .where(eq(buildings.id, buildingId))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: "Building not found" });
    }

    return res.json({
      message: "Building updated",
      data: result[0],
    });
  } catch (error: any) {
    console.error(error);

    if (error?.cause?.code === "23505") {
      return res.status(409).json({ error: "Building already exists" });
    }

    return res.status(500).json({ error: "Update failed" });
  }
});

export default router;