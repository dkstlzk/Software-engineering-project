ALTER TABLE "system_preferences"
ADD COLUMN IF NOT EXISTS "auto_load_sections" jsonb NOT NULL
DEFAULT '{"dashboard":false,"bookings":false,"rooms":false,"availability":false,"bookingRequests":false,"users":false}'::jsonb;

UPDATE "system_preferences"
SET "auto_load_sections" = '{"dashboard":false,"bookings":false,"rooms":false,"availability":false,"bookingRequests":false,"users":false}'::jsonb
WHERE "auto_load_sections" IS NULL;
