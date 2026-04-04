import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { rooms, staffBuildingAssignments } from "../../../db/schema";

type DbExecutor = typeof db | any;

function isMissingAssignmentsTableError(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  const message =
    (cause?.message ?? (error as { message?: string })?.message ?? "").toLowerCase();

  return cause?.code === "42P01" && message.includes("staff_building_assignments");
}

export async function getAssignedBuildingIdsForStaff(
  staffUserId: number,
  executor: DbExecutor = db,
): Promise<number[]> {
  try {
    const rows = await executor
      .select({ buildingId: staffBuildingAssignments.buildingId })
      .from(staffBuildingAssignments)
      .where(eq(staffBuildingAssignments.staffId, staffUserId));

    return rows.map((row: { buildingId: number }) => row.buildingId);
  } catch (error) {
    if (isMissingAssignmentsTableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function isBuildingAssignedToStaff(
  staffUserId: number,
  buildingId: number,
  executor: DbExecutor = db,
): Promise<boolean> {
  try {
    const rows = await executor
      .select({ buildingId: staffBuildingAssignments.buildingId })
      .from(staffBuildingAssignments)
      .where(
        and(
          eq(staffBuildingAssignments.staffId, staffUserId),
          eq(staffBuildingAssignments.buildingId, buildingId),
        ),
      )
      .limit(1);

    return rows.length > 0;
  } catch (error) {
    if (isMissingAssignmentsTableError(error)) {
      return false;
    }

    throw error;
  }
}

export async function isRoomAssignedToStaff(
  staffUserId: number,
  roomId: number,
  executor: DbExecutor = db,
): Promise<boolean> {
  try {
    const rows = await executor
      .select({ roomId: rooms.id })
      .from(rooms)
      .innerJoin(
        staffBuildingAssignments,
        and(
          eq(staffBuildingAssignments.buildingId, rooms.buildingId),
          eq(staffBuildingAssignments.staffId, staffUserId),
        ),
      )
      .where(eq(rooms.id, roomId))
      .limit(1);

    return rows.length > 0;
  } catch (error) {
    if (isMissingAssignmentsTableError(error)) {
      return false;
    }

    throw error;
  }
}
