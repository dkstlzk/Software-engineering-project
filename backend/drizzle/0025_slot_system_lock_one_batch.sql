-- Add is_locked column to slot_systems
ALTER TABLE "slot_systems" ADD COLUMN IF NOT EXISTS "is_locked" boolean NOT NULL DEFAULT false;

-- Partial unique index: only one PREVIEWED batch per slot system
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_batch_per_system"
  ON "timetable_import_batches" ("slot_system_id")
  WHERE "status" = 'PREVIEWED';
