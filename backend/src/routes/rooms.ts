import { Router } from "express";
import { db } from "../db";
import { rooms , buildings } from "../db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// GET /rooms/:id
router.get("/:id", async (req, res) => {
  try {
    const idParam = req.params.id;
    const roomId = Number(idParam);

    // Validate
    if (Number.isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    const result = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json(result[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

//GET rooms with optional buildingId filter
router.get("/", async (req, res) => {
  try {
    const buildingId = req.query.buildingId;

    // If buildingId is provided
    if (buildingId !== undefined) {
      const parsedId = Number(buildingId);

      // Validate number
      if (Number.isNaN(parsedId)) {
        return res.status(400).json({ error: "Invalid buildingId" });
      }

      // Step 1: Check if building exists
      const building = await db
        .select()
        .from(buildings)
        .where(eq(buildings.id, parsedId))
        .limit(1);

      if (building.length === 0) {
        return res.status(404).json({ error: "Building not found" });
      }

      // Step 2: Fetch rooms
      const result = await db
        .select()
        .from(rooms)
        .where(eq(rooms.buildingId, parsedId));

      return res.json(result);
    }

    // No filter → return all rooms
    const result = await db.select().from(rooms);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});


//POST room 
router.post("/", async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const buildingIdRaw = req.body?.buildingId;

    // Validate name
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    // Validate buildingId presence
    if (buildingIdRaw === undefined) {
      return res.status(400).json({ error: "buildingId is required" });
    }

    // Convert + validate number
    const buildingId = Number(buildingIdRaw);

    if (Number.isNaN(buildingId)) {
      return res.status(400).json({ error: "Invalid buildingId" });
    }

    const result = await db
      .insert(rooms)
      .values({ name, buildingId })
      .returning();

    res.json(result[0]);
  } catch (error: any) {
    if (error?.cause?.code === "23505") {
      return res.status(409).json({ error: "Room already exists in this building" });
    }

    if (error?.cause?.code === "23503") {
      return res.status(400).json({ error: "Invalid buildingId" });
    }

    res.status(500).json({ error: "Insert failed" });
  }
});

// DELETE /rooms/:id
router.delete("/:id", async (req, res) => {
  try {
    const idParam = req.params.id;
    const roomId = Number(idParam);

    // Validate
    if (Number.isNaN(roomId)) {
      return res.status(400).json({ error: "Invalid room id" });
    }

    const result = await db
      .delete(rooms)
      .where(eq(rooms.id, roomId))
      .returning();

    // Not found
    if (result.length === 0) {
      return res.status(404).json({ error: "Room not found" });
    }

    res.json({ message: "Room deleted" });
  } catch (error) {
    res.status(500).json({ error: "Delete failed" });
  }
});

export default router;