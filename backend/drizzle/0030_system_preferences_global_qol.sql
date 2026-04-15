CREATE TABLE IF NOT EXISTS "system_preferences" (
  "id" integer PRIMARY KEY NOT NULL DEFAULT 1,
  "manual_data_loading" boolean NOT NULL DEFAULT true,
  "auto_load_dependent_data" boolean NOT NULL DEFAULT false,
  "updated_by" integer,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "system_preferences_singleton_check" CHECK ("id" = 1)
);

DO $$ BEGIN
  ALTER TABLE "system_preferences"
    ADD CONSTRAINT "system_preferences_updated_by_users_id_fk"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "system_preferences_updated_by_idx"
  ON "system_preferences" ("updated_by");

INSERT INTO "system_preferences" (
  "id",
  "manual_data_loading",
  "auto_load_dependent_data"
)
VALUES (
  1,
  true,
  false
)
ON CONFLICT ("id") DO NOTHING;
