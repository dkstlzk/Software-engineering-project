DO $$ BEGIN
  CREATE TYPE "booking_edit_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "booking_edit_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_id" integer NOT NULL,
  "proposed_room_id" integer,
  "proposed_start_at" timestamp,
  "proposed_end_at" timestamp,
  "status" "booking_edit_request_status" NOT NULL DEFAULT 'PENDING',
  "requested_by" integer NOT NULL,
  "reviewed_by" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "booking_edit_requests_proposed_fields_present_check"
    CHECK (
      "proposed_room_id" IS NOT NULL
      OR "proposed_start_at" IS NOT NULL
      OR "proposed_end_at" IS NOT NULL
    )
);

DO $$ BEGIN
  ALTER TABLE "booking_edit_requests"
    ADD CONSTRAINT "booking_edit_requests_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "booking_edit_requests"
    ADD CONSTRAINT "booking_edit_requests_proposed_room_id_rooms_id_fk"
    FOREIGN KEY ("proposed_room_id") REFERENCES "public"."rooms"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "booking_edit_requests"
    ADD CONSTRAINT "booking_edit_requests_requested_by_users_id_fk"
    FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "booking_edit_requests"
    ADD CONSTRAINT "booking_edit_requests_reviewed_by_users_id_fk"
    FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "booking_edit_requests_booking_id_idx"
  ON "booking_edit_requests" ("booking_id");
CREATE INDEX IF NOT EXISTS "booking_edit_requests_status_idx"
  ON "booking_edit_requests" ("status");
CREATE INDEX IF NOT EXISTS "booking_edit_requests_requested_by_idx"
  ON "booking_edit_requests" ("requested_by");
