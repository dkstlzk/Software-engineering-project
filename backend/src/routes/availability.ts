import { Router, Request, Response } from 'express';
import { and, asc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { buildings, rooms, bookings } from '../db/schema';
import { authMiddleware } from "../middleware/auth";
import { getAssignedBuildingIdsForStaff } from "../services/staffBuildingScope";

const router = Router();

type AvailabilityRoom = {
  id: number;
  name: string;
  isAvailable: boolean;
};

type AvailabilityBuilding = {
  buildingId: number;
  buildingName: string;
  rooms: AvailabilityRoom[];
};

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.trim() === '') return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const startAt = parseDate(req.query.startAt);
  const endAt = parseDate(req.query.endAt);
  const buildingId = parseOptionalInt(req.query.buildingId);

  if (!startAt || !endAt || startAt.getTime() >= endAt.getTime()) {
    res.status(400).json({ message: 'Invalid startAt or endAt' });
    return;
  }

  if (req.query.buildingId !== undefined && buildingId === null) {
    res.status(400).json({ message: 'Invalid buildingId' });
    return;
  }

  try {
    const isStaff = req.user?.role === "STAFF";
    const assignedBuildingIds = isStaff
      ? await getAssignedBuildingIdsForStaff(req.user!.id)
      : [];

    if (isStaff && buildingId !== null && !assignedBuildingIds.includes(buildingId)) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    if (isStaff && assignedBuildingIds.length === 0) {
      res.json([]);
      return;
    }

    const conditions = [];

    if (buildingId !== null) {
      conditions.push(eq(rooms.buildingId, buildingId));
    }

    if (isStaff) {
      conditions.push(inArray(rooms.buildingId, assignedBuildingIds));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        buildingId: buildings.id,
        buildingName: buildings.name,
        roomId: rooms.id,
        roomName: rooms.name,
        bookingCount: sql<number>`count(${bookings.id})`,
      })
      .from(rooms)
      .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
      .leftJoin(
        bookings,
        and(
          eq(bookings.roomId, rooms.id),
          lt(bookings.startAt, endAt),
          gt(bookings.endAt, startAt)
        )
      )
      .where(whereClause)
      .groupBy(buildings.id, buildings.name, rooms.id, rooms.name)
      .orderBy(asc(buildings.name), asc(rooms.name));

    const grouped = new Map<number, AvailabilityBuilding>();

    for (const row of rows) {
      const room: AvailabilityRoom = {
        id: row.roomId,
        name: row.roomName,
        isAvailable: Number(row.bookingCount) === 0,
      };

      const existing = grouped.get(row.buildingId);

      if (existing) {
        existing.rooms.push(room);
      } else {
        grouped.set(row.buildingId, {
          buildingId: row.buildingId,
          buildingName: row.buildingName,
          rooms: [room],
        });
      }
    }

    res.json(Array.from(grouped.values()));
  } catch (error) {
    console.error('GET /availability error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;