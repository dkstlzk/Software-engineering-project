-- Add new notification types for slot/venue changes
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'SLOT_CHANGE_REQUESTED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'SLOT_CHANGE_APPROVED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'SLOT_CHANGE_REJECTED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'VENUE_CHANGE_REQUESTED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'VENUE_CHANGE_APPROVED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'VENUE_CHANGE_REJECTED';--> statement-breakpoint

-- Create venue change request status enum
CREATE TYPE "public"."venue_change_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint

-- Create venue change requests table
CREATE TABLE "venue_change_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"requested_by" integer NOT NULL,
	"course_id" integer NOT NULL,
	"current_booking_id" integer NOT NULL,
	"proposed_room_id" integer NOT NULL,
	"reason" text NOT NULL,
	"status" "venue_change_request_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" integer,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Add foreign keys
ALTER TABLE "venue_change_requests" ADD CONSTRAINT "venue_change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_change_requests" ADD CONSTRAINT "venue_change_requests_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_change_requests" ADD CONSTRAINT "venue_change_requests_current_booking_id_bookings_id_fk" FOREIGN KEY ("current_booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_change_requests" ADD CONSTRAINT "venue_change_requests_proposed_room_id_rooms_id_fk" FOREIGN KEY ("proposed_room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_change_requests" ADD CONSTRAINT "venue_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Add indexes
CREATE INDEX "venue_change_requests_requested_by_idx" ON "venue_change_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "venue_change_requests_course_id_idx" ON "venue_change_requests" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "venue_change_requests_current_booking_id_idx" ON "venue_change_requests" USING btree ("current_booking_id");--> statement-breakpoint
CREATE INDEX "venue_change_requests_proposed_room_id_idx" ON "venue_change_requests" USING btree ("proposed_room_id");--> statement-breakpoint
CREATE INDEX "venue_change_requests_reviewed_by_idx" ON "venue_change_requests" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "venue_change_requests_status_idx" ON "venue_change_requests" USING btree ("status");--> statement-breakpoint

-- Trigger to enforce faculty role for venue change requests
CREATE OR REPLACE FUNCTION "public"."enforce_venue_change_requested_by_faculty"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "public"."users" u
		WHERE u."id" = NEW."requested_by"
			AND u."role" = 'FACULTY'::"public"."user_role"
	) THEN
		RAISE EXCEPTION 'venue_change_requests.requested_by must reference a FACULTY user';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "venue_change_requests_requested_by_faculty_trg"
BEFORE INSERT OR UPDATE OF "requested_by"
ON "venue_change_requests"
FOR EACH ROW
EXECUTE FUNCTION "public"."enforce_venue_change_requested_by_faculty"();
