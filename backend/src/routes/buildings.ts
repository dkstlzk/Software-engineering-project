import { Router } from "express";
import { db } from "../db";
import { buildings ,rooms} from "../db/schema";
import { eq } from "drizzle-orm";

const router = Router();


// GET /buildings/:id/rooms
router.get("/:id/rooms", async (req, res) => {
  try {
    const idParam = req.params.id;
    const buildingId = Number(idParam);

    // Validate
    if (Number.isNaN(buildingId)) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    // Step 1: Check if building exists
    const building = await db
      .select()
      .from(buildings)
      .where(eq(buildings.id, buildingId))
      .limit(1);

    if (building.length === 0) {
      return res.status(404).json({ error: "Building not found" });
    }

    // Step 2: Fetch rooms
    const result = await db
      .select()
      .from(rooms)
      .where(eq(rooms.buildingId, buildingId));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// GET /buildings/:id
router.get("/:id", async (req, res) => {
  try {
    const idParam = req.params.id;
    const buildingId = Number(idParam);

    // Validate
    if (Number.isNaN(buildingId)) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    const result = await db
      .select()
      .from(buildings)
      .where(eq(buildings.id, buildingId))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: "Building not found" });
    }

    res.json(result[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch building" });
  }
});

// GET all buildings
router.get("/", async (req, res) => {
  try {
    const result = await db.select().from(buildings);
    res.json({ data: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch buildings" });
  }
});

// POST create building
router.post("/", async (req, res) => {
  try {
    const name = req.body?.name?.trim();

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await db
      .insert(buildings)
      .values({ name })
      .returning();

    res.json({
      message: "Building created",
      data: result[0],
    });
  } catch (error: any) {
  console.error(error);

  const pgError = error?.cause;

  if (pgError?.code === "23505") {
    return res.status(409).json({
      error: "Building already exists",
    });
  }

  res.status(500).json({ error: "Insert failed" });
}
});

// DELETE /buildings/:id
router.delete("/:id", async (req, res) => {
  try {
    const idParam = req.params.id;
    const buildingId = Number(idParam);

    // Validate
    if (Number.isNaN(buildingId)) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    const result = await db
      .delete(buildings)
      .where(eq(buildings.id, buildingId))
      .returning();

    // If no row deleted → not found
    if (result.length === 0) {
      return res.status(404).json({ error: "Building not found" });
    }

    res.json({ message: "Building deleted" });
  } catch (error: any) {
    console.error(error);

    const pgError = error?.cause;

    // Foreign key violation (rooms exist)
    if (pgError?.code === "23503") {
      return res.status(409).json({
        error: "Cannot delete building with existing rooms",
      });
    }

    res.status(500).json({ error: "Delete failed" });
  }
});

// PATCH /buildings/:id
router.patch("/:id", async (req, res) => {
  try {
    const idParam = req.params.id;
    const buildingId = Number(idParam);
    const name = req.body?.name?.trim();

    // Validate ID
    if (Number.isNaN(buildingId)) {
      return res.status(400).json({ error: "Invalid building id" });
    }

    // Validate name
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const result = await db
      .update(buildings)
      .set({ name })
      .where(eq(buildings.id, buildingId))
      .returning();

    // Not found
    if (result.length === 0) {
      return res.status(404).json({ error: "Building not found" });
    }

    res.json({
      message: "Building updated",
      data: result[0],
    });
  } catch (error: any) {
    console.error(error);

    const pgError = error?.cause;

    // Unique constraint
    if (pgError?.code === "23505") {
      return res.status(409).json({
        error: "Building already exists",
      });
    }

    res.status(500).json({ error: "Update failed" });
  }
});

export default router;