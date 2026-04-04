CREATE TYPE "public"."timetable_commit_session_status" AS ENUM(
  'STARTED',
  'EXTERNAL_DONE',
  'INTERNAL_DONE',
  'FROZEN',
  'COMPLETED',
  'CANCELLED',
  'FAILED'
);

CREATE TABLE "commit_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "batch_id" integer NOT NULL,
  "slot_system_id" integer NOT NULL,
  "status" "timetable_commit_session_status" DEFAULT 'STARTED' NOT NULL,
  "payload_snapshot" text NOT NULL,
  "operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "external_conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "internal_conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "runtime_conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "resolutions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" integer,
  "frozen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "commit_sessions"
  ADD CONSTRAINT "commit_sessions_batch_id_timetable_import_batches_id_fk"
  FOREIGN KEY ("batch_id") REFERENCES "public"."timetable_import_batches"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "commit_sessions"
  ADD CONSTRAINT "commit_sessions_slot_system_id_slot_systems_id_fk"
  FOREIGN KEY ("slot_system_id") REFERENCES "public"."slot_systems"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "commit_sessions"
  ADD CONSTRAINT "commit_sessions_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX "commit_sessions_batch_id_idx" ON "commit_sessions" ("batch_id");
CREATE INDEX "commit_sessions_slot_system_id_idx" ON "commit_sessions" ("slot_system_id");
CREATE INDEX "commit_sessions_status_idx" ON "commit_sessions" ("status");
CREATE INDEX "commit_sessions_created_at_idx" ON "commit_sessions" ("created_at");
