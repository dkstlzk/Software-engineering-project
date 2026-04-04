ALTER TABLE "slot_systems"
  ADD COLUMN IF NOT EXISTS "committed_snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "slot_systems"
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
