import { and, asc, eq } from "drizzle-orm";
import { db } from "../../../db";
import { slotBlocks, slotTimeBands } from "../schema";

type OverlapError = Error & { status: number };

function createOverlapError(status: number, message: string): OverlapError {
	const error = new Error(message) as OverlapError;
	error.status = status;
	return error;
}

export async function assertNoBlockOverlap(input: {
	slotSystemId: number;
	dayId: number;
	startBandId: number;
	laneIndex: number;
	rowSpan: number;
	blockLabel: string;
	excludeBlockId?: number;
}) {
	if (!Number.isInteger(input.rowSpan) || input.rowSpan <= 0) {
		throw createOverlapError(400, "rowSpan must be a positive integer");
	}

	const bands = await db
		.select({
			id: slotTimeBands.id,
			orderIndex: slotTimeBands.orderIndex,
		})
		.from(slotTimeBands)
		.where(eq(slotTimeBands.slotSystemId, input.slotSystemId))
		.orderBy(
			asc(slotTimeBands.startTime),
			asc(slotTimeBands.endTime),
			asc(slotTimeBands.id)
		);

	if (bands.length === 0) {
		throw createOverlapError(400, "No time bands defined for this slot system");
	}

	const bandIndexById = new Map<number, number>(
		bands.map((band, index) => [band.id, index])
	);

	const startIndex = bandIndexById.get(input.startBandId);

	if (startIndex === undefined) {
		throw createOverlapError(400, "startBandId does not belong to the slot system");
	}

	const endIndex = startIndex + input.rowSpan;

	if (endIndex > bands.length) {
		throw createOverlapError(400, "rowSpan exceeds available time bands");
	}

	const normalizedLabel = input.blockLabel.trim().toLowerCase();

	const existingBlocks = await db
		.select({
			id: slotBlocks.id,
			startBandId: slotBlocks.startBandId,
			laneIndex: slotBlocks.laneIndex,
			rowSpan: slotBlocks.rowSpan,
			label: slotBlocks.label,
		})
		.from(slotBlocks)
		.where(
			and(
				eq(slotBlocks.slotSystemId, input.slotSystemId),
				eq(slotBlocks.dayId, input.dayId)
			)
		);

	for (const existing of existingBlocks) {
		if (input.excludeBlockId !== undefined && existing.id === input.excludeBlockId) {
			continue;
		}

		if (existing.laneIndex !== input.laneIndex) {
			continue;
		}

		const existingStartIndex = bandIndexById.get(existing.startBandId);

		if (existingStartIndex === undefined) {
			throw createOverlapError(400, "Existing block uses an invalid start band");
		}

		const safeExistingRowSpan = Math.max(
			1,
			Math.min(existing.rowSpan, bands.length - existingStartIndex)
		);
		const existingEndIndex = existingStartIndex + safeExistingRowSpan;

		if (startIndex < existingEndIndex && endIndex > existingStartIndex) {
			if (existing.label.trim().toLowerCase() === normalizedLabel) {
				throw createOverlapError(
					409,
					"Same label already exists for this day and time range"
				);
			}

			throw createOverlapError(
				409,
				"Selected lane is occupied for this day/time range"
			);
		}
	}
}
