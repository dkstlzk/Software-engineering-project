-- Custom SQL migration file, put your code below! --
-- Enable extension (required for GIST to support = on integers)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlapping bookings for the same room
ALTER TABLE bookings
ADD CONSTRAINT no_overlapping_bookings
EXCLUDE USING gist (
  room_id WITH =,
  tsrange(start_at, end_at) WITH &&
);