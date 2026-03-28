ALTER TABLE "booking_requests" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "booking_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING_FACULTY'::text;--> statement-breakpoint
DROP TYPE "public"."booking_status";--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('PENDING_FACULTY', 'PENDING_STAFF', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "booking_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING_FACULTY'::"public"."booking_status";--> statement-breakpoint
ALTER TABLE "booking_requests" ALTER COLUMN "status" SET DATA TYPE "public"."booking_status" USING "status"::"public"."booking_status";