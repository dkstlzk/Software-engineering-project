-- Speed up time-range queries on bookings
CREATE INDEX IF NOT EXISTS idx_bookings_start_at ON "bookings"("start_at");
CREATE INDEX IF NOT EXISTS idx_bookings_end_at ON "bookings"("end_at");

-- Speed up availability queries (room + time range)
CREATE INDEX IF NOT EXISTS idx_bookings_room_time
ON "bookings"("room_id", "start_at", "end_at");

-- Speed up booking request lookups by status
CREATE INDEX IF NOT EXISTS idx_booking_requests_status ON "booking_requests"("status");

-- Speed up faculty booking request queries
CREATE INDEX IF NOT EXISTS idx_booking_requests_faculty_status
ON "booking_requests"("faculty_id", "status");

-- Speed up room lookups by building
CREATE INDEX IF NOT EXISTS idx_rooms_building_id ON "rooms"("building_id");

-- Speed up staff building assignment lookups
CREATE INDEX IF NOT EXISTS idx_staff_building_assignments_composite
ON "staff_building_assignments"("staff_id", "building_id");

-- Speed up notification filtering (user + read status)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
ON "notifications"("recipient_id", "is_read");