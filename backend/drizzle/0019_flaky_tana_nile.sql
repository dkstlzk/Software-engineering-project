ALTER TABLE "bookings" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "source" SET DEFAULT 'MANUAL_REQUEST'::text;--> statement-breakpoint
DROP TYPE "public"."booking_source";--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('MANUAL_REQUEST', 'TIMETABLE_ALLOCATION', 'SLOT_CHANGE', 'VENUE_CHANGE');--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "source" SET DEFAULT 'MANUAL_REQUEST'::"public"."booking_source";--> statement-breakpoint
UPDATE "bookings"
SET "source" = CASE
	WHEN "source" = 'TIMETABLE_IMPORT' THEN 'TIMETABLE_ALLOCATION'
	WHEN "source" = 'BOOKING_REQUEST' THEN 'MANUAL_REQUEST'
	WHEN "source" = 'MANUAL' THEN 'MANUAL_REQUEST'
	ELSE 'MANUAL_REQUEST'
END;--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "source" SET DATA TYPE "public"."booking_source" USING "source"::"public"."booking_source";--> statement-breakpoint
ALTER TABLE "timetable_import_occurrences" ALTER COLUMN "source" SET DEFAULT 'TIMETABLE_ALLOCATION';--> statement-breakpoint
UPDATE "timetable_import_occurrences"
SET "source" = 'TIMETABLE_ALLOCATION'
WHERE "source" = 'TIMETABLE_IMPORT';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "approved_by" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;