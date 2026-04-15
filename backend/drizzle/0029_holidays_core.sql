CREATE TABLE IF NOT EXISTS "holidays" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "created_by" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "holidays_date_range_check" CHECK ("start_date" <= "end_date")
);

DO $$ BEGIN
  ALTER TABLE "holidays"
    ADD CONSTRAINT "holidays_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "holidays_name_idx"
  ON "holidays" ("name");
CREATE INDEX IF NOT EXISTS "holidays_start_date_idx"
  ON "holidays" ("start_date");
CREATE INDEX IF NOT EXISTS "holidays_end_date_idx"
  ON "holidays" ("end_date");
