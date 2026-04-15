import { and, asc, eq, gt, inArray, lt, sql, or } from 'drizzle-orm';
import { db } from '../../db';
import { buildings, rooms, bookings, bookingRequests, users } from '../../db/schema';
import { redis, isRedisAvailable, SHORT_TTL } from '../../data/cache/redis.client';

export type BookingDetail = {
  id: number;
  startAt: string;
  endAt: string;
  activityName?: string;
  bookedBy?: string;
  contactInfo?: string;
  purpose?: string;
  hasAccess: boolean;
  visibilityLevel: 'full' | 'restricted' | 'none';
};

export type TimelineSegment = {
  start: string;      // ISO 8601 datetime
  end: string;        // ISO 8601 datetime
  status: 'free' | 'booked';
  booking?: {
    id: number;
    title?: string;
    startAt: string;
    endAt: string;
    bookedBy?: string;
    activityName?: string;
    contactInfo?: string;
    purpose?: string;
  };
  isRestricted?: boolean;  // true if booking details are masked
};

export type RoomDayTimeline = {
  room: {
    id: number;
    name: string;
    buildingId: number;
    buildingName: string;
  };
  date: string;  // YYYY-MM-DD
  segments: TimelineSegment[];
};

export type RoomWithAvailability = {
  id: number;
  name: string;
  isAvailable: boolean;
  bookings?: BookingDetail[];
};

export type BuildingWithRooms = {
  buildingId: number;
  buildingName: string;
  rooms: RoomWithAvailability[];
};

interface QueryParams {
  startAt: Date;
  endAt: Date;
  buildingId?: number | null | undefined;
  buildingIds?: number[];
  limit?: number;
}

interface QueryParamsWithRbac extends QueryParams {
  userId: number;
  userRole: 'ADMIN' | 'STAFF' | 'FACULTY' | 'STUDENT' | 'PENDING_ROLE';
  staffBuildingIds?: number[];
}

/**
 * Generate cache key for availability query
 */
export function getAvailabilityCacheKey(
  buildingId: number | undefined | null,
  startAt: Date,
  endAt: Date
): string {
  const bid = buildingId ?? 'all';
  return `availability:${bid}:${startAt.getTime()}:${endAt.getTime()}`;
}

/**
 * Query rooms and their availability for a given time range.
 * Uses a single optimized query with joins instead of separate queries.
 */
async function queryAvailability(params: QueryParams): Promise<BuildingWithRooms[]> {
  const { startAt, endAt, buildingId, buildingIds = [], limit = 100 } = params;

  const conditions = [];

  if (buildingId !== null && buildingId !== undefined) {
    conditions.push(eq(rooms.buildingId, buildingId));
  } else if (buildingIds.length > 0) {
    conditions.push(inArray(rooms.buildingId, buildingIds));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Single optimized query with joins
  // LEFT JOIN bookings to count overlapping bookings in the time range
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
    .orderBy(asc(buildings.name), asc(rooms.name))
    .limit(limit);

  // Group results by building
  const grouped = new Map<number, BuildingWithRooms>();

  for (const row of rows) {
    const room: RoomWithAvailability = {
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

  return Array.from(grouped.values());
}

/**
 * Determine visibility level of a booking based on user's role and building scope.
 * Returns:
 * - 'full': User has full access to see all booking details
 * - 'restricted': User can see booking exists but not details
 * - 'none': Should not be returned (filtered at query level)
 */
function getBookingVisibilityLevel(
  userRole: 'ADMIN' | 'STAFF' | 'FACULTY' | 'STUDENT' | 'PENDING_ROLE',
  userId: number,
  bookingUserId: number | null,
  bookingBuildingId: number,
  staffBuildingIds: number[] = []
): 'full' | 'restricted' {
  // ADMIN: full access to all bookings
  if (userRole === 'ADMIN') {
    return 'full';
  }

  // STAFF: full access if booking is in their assigned buildings
  if (userRole === 'STAFF') {
    if (staffBuildingIds.includes(bookingBuildingId)) {
      return 'full';
    }
    return 'restricted';
  }

  // FACULTY & STUDENT: full access only to their own bookings
  if (userRole === 'FACULTY' || userRole === 'STUDENT') {
    if (bookingUserId === userId) {
      return 'full';
    }
    return 'restricted';
  }

  // PENDING_ROLE: restricted access to all bookings
  return 'restricted';
}

/**
 * Query availability with detailed booking information and RBAC filtering.
 * Returns bookings with visibility levels based on user's role and building scope.
 */
async function queryAvailabilityWithBookings(
  params: QueryParamsWithRbac
): Promise<BuildingWithRooms[]> {
  const {
    startAt,
    endAt,
    buildingId,
    buildingIds = [],
    userId,
    userRole,
    staffBuildingIds = [],
    limit = 100,
  } = params;

  const conditions = [];

  if (buildingId !== null && buildingId !== undefined) {
    conditions.push(eq(rooms.buildingId, buildingId));
  } else if (buildingIds.length > 0) {
    conditions.push(inArray(rooms.buildingId, buildingIds));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Fetch all bookings in the time range for relevant rooms
  const bookingRows = await db
    .select({
      bookingId: bookings.id,
      bookingStartAt: bookings.startAt,
      bookingEndAt: bookings.endAt,
      roomId: bookings.roomId,
      roomName: rooms.name,
      buildingId: buildings.id,
      buildingName: buildings.name,
      requestId: bookings.requestId,
      userId: bookingRequests.userId,
      facultyId: bookingRequests.facultyId,
      purpose: bookingRequests.purpose,
      eventType: bookingRequests.eventType,
      userName: users.name,
      userEmail: users.email,
    })
    .from(bookings)
    .innerJoin(rooms, eq(bookings.roomId, rooms.id))
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .leftJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
    .leftJoin(users, or(
      eq(bookingRequests.userId, users.id),
      eq(bookingRequests.facultyId, users.id)
    ))
    .where(
      and(
        whereClause,
        lt(bookings.startAt, endAt),
        gt(bookings.endAt, startAt)
      )
    )
    .orderBy(asc(buildings.name), asc(rooms.name), asc(bookings.startAt))
    .limit(limit);

  // Group results by building/room and add booking details with visibility
  const grouped = new Map<number, Map<number, RoomWithAvailability>>();

  for (const row of bookingRows) {
    if (!grouped.has(row.buildingId)) {
      grouped.set(row.buildingId, new Map());
    }

    const roomMap = grouped.get(row.buildingId)!;
    const existingRoom = roomMap.get(row.roomId);

    const bookingUserId = row.userId || row.facultyId;
    const visibilityLevel = getBookingVisibilityLevel(
      userRole,
      userId,
      bookingUserId,
      row.buildingId,
      staffBuildingIds
    );

    const bookingDetail: BookingDetail = {
      id: row.bookingId,
      startAt: row.bookingStartAt.toISOString(),
      endAt: row.bookingEndAt.toISOString(),
      hasAccess: visibilityLevel === 'full',
      visibilityLevel,
    };

    if (visibilityLevel === 'full') {
      if (row.eventType) {
        bookingDetail.activityName = row.eventType;
      }
      bookingDetail.bookedBy = row.userName || 'Unknown';
      bookingDetail.contactInfo = row.userEmail || '';
      bookingDetail.purpose = row.purpose || '';
    }

    if (existingRoom) {
      existingRoom.bookings = existingRoom.bookings || [];
      existingRoom.bookings.push(bookingDetail);
    } else {
      roomMap.set(row.roomId, {
        id: row.roomId,
        name: row.roomName,
        isAvailable: false,
        bookings: [bookingDetail],
      });
    }
  }

  // Also get rooms with no bookings
  const allRooms = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      buildingId: buildings.id,
      buildingName: buildings.name,
    })
    .from(rooms)
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(whereClause)
    .orderBy(asc(buildings.name), asc(rooms.name))
    .limit(limit);

  // Merge with rooms that have no bookings
  for (const room of allRooms) {
    if (!grouped.has(room.buildingId)) {
      grouped.set(room.buildingId, new Map());
    }

    const roomMap = grouped.get(room.buildingId)!;
    if (!roomMap.has(room.id)) {
      roomMap.set(room.id, {
        id: room.id,
        name: room.name,
        isAvailable: true,
      });
    }
  }

  // Convert to final format
  const result: BuildingWithRooms[] = [];
  for (const [buildingId, roomMap] of grouped) {
    const buildingName = allRooms.find((r) => r.buildingId === buildingId)?.buildingName || 'Unknown';
    result.push({
      buildingId,
      buildingName,
      rooms: Array.from(roomMap.values()),
    });
  }

  return result.sort((a, b) => a.buildingName.localeCompare(b.buildingName));
}

/**
 * Get availability with booking details and RBAC filtering (no caching due to per-user data).
 * Returns bookings with visibility levels based on user's role and building scope.
 */
export async function getAvailabilityWithBookingsAndRbac(
  params: QueryParamsWithRbac
): Promise<BuildingWithRooms[]> {
  return queryAvailabilityWithBookings(params);
}

export async function getAvailabilityWithCache(
  params: QueryParams
): Promise<BuildingWithRooms[]> {
  const cacheKey = getAvailabilityCacheKey(
    params.buildingId,
    params.startAt,
    params.endAt
  );

  // Try to get from cache
  if (isRedisAvailable) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as BuildingWithRooms[];
      }
    } catch (error) {
      // Log but don't fail if cache read fails
      console.warn('Cache read error:', error);
    }
  }

  // Query database if not cached
  const result = await queryAvailability(params);

  // Store in cache with SHORT_TTL (5 minutes)
  if (isRedisAvailable) {
    try {
      await redis.setex(cacheKey, SHORT_TTL, JSON.stringify(result));
    } catch (error) {
      // Log but don't fail if cache write fails
      console.warn('Cache write error:', error);
    }
  }

  return result;
}

/**
 * Get availability without caching (for bypassing cache if needed).
 */
export async function getAvailabilityDirect(
  params: QueryParams
): Promise<BuildingWithRooms[]> {
  return queryAvailability(params);
}

/**
 * Invalidate availability cache for a specific time range and building.
 * Useful when bookings are created or modified.
 */
export async function invalidateAvailabilityCache(
  buildingId?: number | null,
  startAt?: Date,
  endAt?: Date
): Promise<void> {
  if (!isRedisAvailable) {
    return;
  }

  try {
    if (buildingId !== undefined && startAt && endAt) {
      const cacheKey = getAvailabilityCacheKey(buildingId, startAt, endAt);
      await redis.del(cacheKey);
    } else {
      // Invalidate all availability caches if no specific params
      const pattern = 'availability:*';
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (error) {
    console.warn('Cache invalidation error:', error);
  }
}

export interface HourlySlot {
  hour: number;
  bookings: BookingDetail[];
  isAvailable: boolean;
}

export interface RoomDayAvailability {
  room: {
    id: number;
    name: string;
    buildingId: number;
    buildingName: string;
  };
  date: string;
  bookings: BookingDetail[];
  hourlySlots: HourlySlot[];
}

/**
 * Get full-day availability for a specific room with hourly breakdown.
 * Optimized for single room + single day queries.
 * Includes RBAC filtering for booking details.
 */
export async function getRoomDayAvailabilityQuery(
  roomId: number,
  dateStr: string,
  user: {
    id: number;
    role: 'ADMIN' | 'STAFF' | 'FACULTY' | 'STUDENT' | 'PENDING_ROLE';
    staffBuildingIds?: number[];
  }
): Promise<RoomDayAvailability> {
  // Parse the date and construct full day range
  const dayStart = new Date(`${dateStr}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Get room details
  const roomData = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      buildingId: rooms.buildingId,
      buildingName: buildings.name,
    })
    .from(rooms)
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (roomData.length === 0) {
    throw new Error(`Room with id ${roomId} not found`);
  }

  const roomInfo = roomData[0]!;

  // Get all bookings for this room on this day
  const bookingData = await db
    .select({
      bookingId: bookings.id,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      requestId: bookings.requestId,
      userId: bookingRequests.userId,
      facultyId: bookingRequests.facultyId,
      eventType: bookingRequests.eventType,
      purpose: bookingRequests.purpose,
      userName: users.name,
      userEmail: users.email,
    })
    .from(bookings)
    .leftJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
    .leftJoin(
      users,
      or(
        eq(bookingRequests.userId, users.id),
        eq(bookingRequests.facultyId, users.id)
      )
    )
    .where(
      and(
        eq(bookings.roomId, roomId),
        lt(bookings.startAt, dayEnd),
        gt(bookings.endAt, dayStart)
      )
    )
    .orderBy(asc(bookings.startAt));

  // Process bookings with visibility filtering
  const bookingDetails: BookingDetail[] = [];
  const bookingsByHour: Map<number, BookingDetail[]> = new Map();

  for (const row of bookingData) {
    const bookingUserId = row.userId || row.facultyId;
    const visibilityLevel = getBookingVisibilityLevel(
      user.role,
      user.id,
      bookingUserId,
      roomInfo.buildingId,
      user.staffBuildingIds || []
    );

    const detail: BookingDetail = {
      id: row.bookingId,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      hasAccess: visibilityLevel === 'full',
      visibilityLevel,
    };

    if (visibilityLevel === 'full') {
      if (row.eventType) {
        detail.activityName = row.eventType;
      }
      detail.bookedBy = row.userName || 'Unknown';
      detail.contactInfo = row.userEmail || '';
      detail.purpose = row.purpose || '';
    }

    bookingDetails.push(detail);

    // Map booking to hourly slots
    const startHour = Math.floor(
      (row.startAt.getTime() - dayStart.getTime()) / (60 * 60 * 1000)
    );
    const endHour = Math.ceil(
      (row.endAt.getTime() - dayStart.getTime()) / (60 * 60 * 1000)
    );

    for (let hour = Math.max(0, startHour); hour < Math.min(24, endHour); hour++) {
      if (!bookingsByHour.has(hour)) {
        bookingsByHour.set(hour, []);
      }
      bookingsByHour.get(hour)!.push(detail);
    }
  }

  // Create hourly slots
  const hourlySlots: HourlySlot[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourBookings = bookingsByHour.get(hour) || [];
    hourlySlots.push({
      hour,
      bookings: hourBookings,
      isAvailable: hourBookings.length === 0,
    });
  }

  return {
    room: {
      id: roomInfo.id,
      name: roomInfo.name,
      buildingId: roomInfo.buildingId,
      buildingName: roomInfo.buildingName,
    },
    date: dateStr,
    bookings: bookingDetails,
    hourlySlots,
  };
}

/**
 * Generate time slots for matrix view.
 * Creates an array of time strings in HH:MM format.
 */
export function generateTimeSlots(
  startTime: string,
  endTime: string,
  durationMinutes: number
): string[] {
  const slots: string[] = [];
  const startParts = startTime.split(':');
  const endParts = endTime.split(':');
  
  const startHour = parseInt(startParts[0] || '0', 10);
  const startMin = parseInt(startParts[1] || '0', 10);
  const endHour = parseInt(endParts[0] || '23', 10);
  const endMin = parseInt(endParts[1] || '59', 10);

  let current = new Date();
  current.setHours(startHour, startMin, 0, 0);

  const end = new Date();
  end.setHours(endHour, endMin, 0, 0);

  while (current < end) {
    slots.push(
      `${current.getHours().toString().padStart(2, '0')}:${current
        .getMinutes()
        .toString()
        .padStart(2, '0')}`
    );
    current.setMinutes(current.getMinutes() + durationMinutes);
  }

  return slots;
}

/**
 * Helper function: Convert ISO string to minutes since midnight
 */
function getMinutesFromMidnight(isoString: string): number {
  const date = new Date(isoString);
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Helper function: Merge adjacent segments with same status and visibility
 */
function mergeAdjacentSegments(segments: TimelineSegment[]): TimelineSegment[] {
  if (segments.length === 0) return [];

  const merged: TimelineSegment[] = [];
  let current = { ...segments[0]! };

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i]!;
    const sameStatus = current.status === next.status;
    const sameVisibility = !!current.isRestricted === !!next.isRestricted;
    const adjacent = current.end === next.start;

    if (sameStatus && sameVisibility && adjacent) {
      // Merge: extend current segment
      current.end = next.end;
    } else {
      // Cannot merge: save current and start new
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Get continuous timeline of room availability for a full day with RBAC-aware visibility.
 * 
 * Returns segments covering the entire 24-hour period:
 * - "free" segments: room is available
 * - "booked" segments: room has a booking (details may be masked based on RBAC)
 * 
 * RBAC Masking Rules:
 * - Admin: sees all booking details
 * - Staff: sees details only if booking is in their assigned buildings
 * - Faculty/Student: sees details only for their own bookings
 * - Restricted: booking details are hidden, shows isRestricted: true
 */
export async function getRoomDayAvailabilityTimeline(
  roomId: number,
  dateStr: string,
  user: {
    id: number;
    role: 'ADMIN' | 'STAFF' | 'FACULTY' | 'STUDENT' | 'PENDING_ROLE';
    staffBuildingIds?: number[];
  }
): Promise<RoomDayTimeline> {
  // Parse date and construct 24-hour range (00:00 - 23:59:59)
  const dayStart = new Date(`${dateStr}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Get room details
  const roomData = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      buildingId: rooms.buildingId,
      buildingName: buildings.name,
    })
    .from(rooms)
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (roomData.length === 0) {
    throw new Error(`Room with id ${roomId} not found`);
  }

  const roomInfo = roomData[0]!;

  // Get all bookings for this room on this day
  const bookingData = await db
    .select({
      bookingId: bookings.id,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      requestId: bookings.requestId,
      userId: bookingRequests.userId,
      facultyId: bookingRequests.facultyId,
      eventType: bookingRequests.eventType,
      purpose: bookingRequests.purpose,
      userName: users.name,
      userEmail: users.email,
    })
    .from(bookings)
    .leftJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
    .leftJoin(
      users,
      or(
        eq(bookingRequests.userId, users.id),
        eq(bookingRequests.facultyId, users.id)
      )
    )
    .where(
      and(
        eq(bookings.roomId, roomId),
        lt(bookings.startAt, dayEnd),
        gt(bookings.endAt, dayStart)
      )
    )
    .orderBy(asc(bookings.startAt));

  // Step 1: Merge overlapping bookings and collect time points
  interface MergedBooking {
    start: Date;
    end: Date;
    bookingId: number;
    userId: number | null;
    facultyId: number | null;
    userName: string | null;
    userEmail: string | null;
    eventType: string | null;
    purpose: string | null;
  }

  const mergedBookings: MergedBooking[] = [];
  const timePoints = new Set<number>(); // milliseconds since epoch

  timePoints.add(dayStart.getTime());
  timePoints.add(dayEnd.getTime());

  // Sort bookings by start time
  const sortedBookings = [...bookingData].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime()
  );

  // Merge overlapping bookings
  for (const booking of sortedBookings) {
    const start = booking.startAt;
    const end = booking.endAt;

    if (mergedBookings.length === 0) {
      mergedBookings.push({
        start,
        end,
        bookingId: booking.bookingId,
        userId: booking.userId,
        facultyId: booking.facultyId,
        userName: booking.userName,
        userEmail: booking.userEmail,
        eventType: booking.eventType,
        purpose: booking.purpose,
      });
    } else {
      const last = mergedBookings[mergedBookings.length - 1]!;
      
      if (start < last.end) {
        // Overlaps: extend the last merged booking
        last.end = new Date(Math.max(last.end.getTime(), end.getTime()));
      } else {
        // No overlap: add as new segment
        mergedBookings.push({
          start,
          end,
          bookingId: booking.bookingId,
          userId: booking.userId,
          facultyId: booking.facultyId,
          userName: booking.userName,
          userEmail: booking.userEmail,
          eventType: booking.eventType,
          purpose: booking.purpose,
        });
      }
    }

    // Collect time points
    timePoints.add(start.getTime());
    timePoints.add(end.getTime());
  }

  // Step 2: Build raw segments (before RBAC masking)
  const rawSegments: TimelineSegment[] = [];
  const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);

  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const timeStart = sortedPoints[i]!;
    const timeEnd = sortedPoints[i + 1]!;
    const segStart = new Date(timeStart);
    const segEnd = new Date(timeEnd);

    // Find if any booking covers this segment
    const coveringBooking = mergedBookings.find(
      (b) => b.start <= segStart && segEnd <= b.end
    );

    const segmentObj: TimelineSegment = {
      start: segStart.toISOString(),
      end: segEnd.toISOString(),
      status: coveringBooking ? 'booked' : 'free',
    };

    if (coveringBooking) {
      const bookingObj: NonNullable<TimelineSegment['booking']> = {
        id: coveringBooking.bookingId,
        startAt: coveringBooking.start.toISOString(),
        endAt: coveringBooking.end.toISOString(),
      };

      if (coveringBooking.eventType) bookingObj.title = coveringBooking.eventType;
      if (coveringBooking.userName) bookingObj.bookedBy = coveringBooking.userName;
      if (coveringBooking.eventType) bookingObj.activityName = coveringBooking.eventType;
      if (coveringBooking.userEmail) bookingObj.contactInfo = coveringBooking.userEmail;
      if (coveringBooking.purpose) bookingObj.purpose = coveringBooking.purpose;

      segmentObj.booking = bookingObj;
    }

    rawSegments.push(segmentObj);
  }

  // Step 3: Apply RBAC masking (mask booking details based on user role)
  const maskedSegments: TimelineSegment[] = rawSegments.map((seg) => {
    if (!seg.booking) {
      return seg;
    }

    const booking = seg.booking;
    const bookingUserId = booking.bookedBy ? 
      bookingData.find(b => b.userName === booking.bookedBy)?.userId ?? null :
      null;

    const visibility = getBookingVisibilityLevel(
      user.role,
      user.id,
      bookingUserId,
      roomInfo.buildingId,
      user.staffBuildingIds || []
    );

    if (visibility === 'full') {
      // Full access: keep all details
      return seg;
    } else {
      // Restricted: hide booking details
      return {
        start: seg.start,
        end: seg.end,
        status: 'booked' as const,
        isRestricted: true,
      };
    }
  });

  // Step 4: Merge adjacent segments with same status and visibility
  const finalSegments = mergeAdjacentSegments(maskedSegments);

  return {
    room: {
      id: roomInfo.id,
      name: roomInfo.name,
      buildingId: roomInfo.buildingId,
      buildingName: roomInfo.buildingName,
    },
    date: dateStr,
    segments: finalSegments,
  };
}

/**
 * Check if a booking overlaps with a time slot.
 */
function bookingOverlapsSlot(
  booking: { startAt: Date; endAt: Date },
  slotTime: string,
  date: string,
  durationMinutes: number
): boolean {
  const [slotHour, slotMin] = slotTime.split(':').map(Number);
  const slotStart = new Date(`${date}T${slotTime}:00+05:30`);
  const slotEnd = new Date(slotStart);
  slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

  return booking.startAt < slotEnd && booking.endAt > slotStart;
}

export interface MatrixSlot {
  time: string;
  status: 'booked' | 'available';
  bookingCount: number;
  bookings: BookingDetail[];
}

export interface MatrixRoom {
  roomId: number;
  roomName: string;
  slots: MatrixSlot[];
}

export interface BuildingMatrix {
  buildingId: number;
  buildingName: string;
  date: string;
  timeRange: { start: string; end: string };
  slotDuration: number;
  matrix: MatrixRoom[];
}

/**
 * Get building matrix availability for efficient matrix view rendering.
 * Optimized for single building + single day queries.
 * Returns pre-computed matrix structure (rooms × time slots).
 * Includes RBAC filtering for booking details.
 */
export async function getBuildingMatrixAvailability(
  buildingId: number,
  startTime: string, // HH:MM format
  endTime: string, // HH:MM format
  date: string, // YYYY-MM-DD format
  slotDuration: number, // minutes per slot
  user: {
    id: number;
    role: 'ADMIN' | 'STAFF' | 'FACULTY' | 'STUDENT' | 'PENDING_ROLE';
    staffBuildingIds?: number[];
  }
): Promise<BuildingMatrix> {
  // Generate time slots
  const slots = generateTimeSlots(startTime, endTime, slotDuration);

  // Parse day boundaries
  const dayStart = new Date(`${date}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // Construct time range boundaries for query
  const queryStart = new Date(`${date}T${startTime}:00+05:30`);
  const queryEnd = new Date(`${date}T${endTime}:00+05:30`);

  // Get all rooms in building
  const roomsData = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      buildingId: buildings.id,
      buildingName: buildings.name,
    })
    .from(rooms)
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(eq(rooms.buildingId, buildingId))
    .orderBy(asc(rooms.name));

  if (roomsData.length === 0) {
    throw new Error(`Building with id ${buildingId} not found`);
  }

  const buildingName = roomsData[0]!.buildingName;
  const roomIds = roomsData.map((r) => r.id);

  // Get all bookings for all rooms in the time range (single optimized query)
  const bookingsData = await db
    .select({
      bookingId: bookings.id,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      roomId: bookings.roomId,
      requestId: bookings.requestId,
      userId: bookingRequests.userId,
      facultyId: bookingRequests.facultyId,
      eventType: bookingRequests.eventType,
      purpose: bookingRequests.purpose,
      userName: users.name,
      userEmail: users.email,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.roomId, roomIds),
        lt(bookings.startAt, queryEnd),
        gt(bookings.endAt, queryStart)
      )
    )
    .leftJoin(bookingRequests, eq(bookings.requestId, bookingRequests.id))
    .leftJoin(
      users,
      or(
        eq(bookingRequests.userId, users.id),
        eq(bookingRequests.facultyId, users.id)
      )
    )
    .orderBy(asc(bookings.roomId), asc(bookings.startAt));

  // Group bookings by room
  const bookingsByRoom = new Map<number, typeof bookingsData>();
  for (const booking of bookingsData) {
    if (!bookingsByRoom.has(booking.roomId)) {
      bookingsByRoom.set(booking.roomId, []);
    }
    bookingsByRoom.get(booking.roomId)!.push(booking);
  }

  // Build matrix structure
  const matrix: MatrixRoom[] = roomsData.map((room) => {
    const roomBookings = bookingsByRoom.get(room.id) || [];

    const matrixSlots: MatrixSlot[] = slots.map((slotTime) => {
      // Find bookings that overlap this slot
      const slotBookings = roomBookings.filter((booking) =>
        bookingOverlapsSlot(booking, slotTime, date, slotDuration)
      );

      // Process booking details with RBAC filtering
      const processedBookings: BookingDetail[] = slotBookings.map((booking) => {
        const bookingUserId = booking.userId || booking.facultyId;
        const visibilityLevel = getBookingVisibilityLevel(
          user.role,
          user.id,
          bookingUserId,
          buildingId,
          user.staffBuildingIds || []
        );

        const detail: BookingDetail = {
          id: booking.bookingId,
          startAt: booking.startAt.toISOString(),
          endAt: booking.endAt.toISOString(),
          hasAccess: visibilityLevel === 'full',
          visibilityLevel,
        };

        if (visibilityLevel === 'full') {
          if (booking.eventType) {
            detail.activityName = booking.eventType;
          }
          detail.bookedBy = booking.userName || 'Unknown';
          detail.contactInfo = booking.userEmail || '';
          detail.purpose = booking.purpose || '';
        }

        return detail;
      });

      return {
        time: slotTime,
        status: processedBookings.length > 0 ? 'booked' : 'available',
        bookingCount: processedBookings.length,
        bookings: processedBookings,
      };
    });

    return {
      roomId: room.id,
      roomName: room.name,
      slots: matrixSlots,
    };
  });

  return {
    buildingId,
    buildingName,
    date,
    timeRange: { start: startTime, end: endTime },
    slotDuration,
    matrix,
  };
}
