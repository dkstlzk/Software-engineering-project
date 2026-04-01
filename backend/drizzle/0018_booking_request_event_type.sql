CREATE TYPE "public"."booking_event_type" AS ENUM('QUIZ', 'SEMINAR', 'SPEAKER_SESSION', 'MEETING', 'CULTURAL_EVENT', 'WORKSHOP', 'CLASS', 'OTHER');--> statement-breakpoint
ALTER TABLE "booking_requests" ADD COLUMN "event_type" "booking_event_type" DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD COLUMN "participant_count" integer;--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_participant_count_positive_check" CHECK ("booking_requests"."participant_count" IS NULL OR "booking_requests"."participant_count" > 0);