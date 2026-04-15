CREATE TABLE IF NOT EXISTS "timetable_day_overrides" (
  "id" serial PRIMARY KEY NOT NULL,
  "target_date" date NOT NULL,
  "follows_day_of_week" "day_of_week" NOT NULL,
  "note" text,
  "created_by" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_by" integer,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "timetable_day_overrides_target_date_unique"
  ON "timetable_day_overrides" ("target_date");

CREATE INDEX IF NOT EXISTS "timetable_day_overrides_follows_day_idx"
  ON "timetable_day_overrides" ("follows_day_of_week");

CREATE INDEX IF NOT EXISTS "timetable_day_overrides_target_date_idx"
  ON "timetable_day_overrides" ("target_date");

DO $$ BEGIN
  ALTER TABLE "timetable_day_overrides"
    ADD CONSTRAINT "timetable_day_overrides_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "timetable_day_overrides"
    ADD CONSTRAINT "timetable_day_overrides_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
