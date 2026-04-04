-- Create room_type enum
DO $$ BEGIN
    CREATE TYPE room_type AS ENUM (
        'LECTURE_HALL',
        'CLASSROOM',
        'SEMINAR_ROOM',
        'COMPUTER_LAB',
        'CONFERENCE_ROOM',
        'AUDITORIUM',
        'WORKSHOP',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns to rooms table
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "capacity" integer;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "room_type" room_type DEFAULT 'OTHER';
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "has_projector" boolean DEFAULT false NOT NULL;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "has_mic" boolean DEFAULT false NOT NULL;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "accessible" boolean DEFAULT true NOT NULL;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "equipment_list" text;

-- Add new columns to buildings table
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "location" text;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "managed_by_staff_id" integer REFERENCES "users"("id") ON DELETE SET NULL;

-- Add index for building manager lookups
CREATE INDEX IF NOT EXISTS idx_buildings_managed_by ON "buildings"("managed_by_staff_id");

-- Add index for accessible room filtering
CREATE INDEX IF NOT EXISTS idx_rooms_accessible ON "rooms"("accessible");
