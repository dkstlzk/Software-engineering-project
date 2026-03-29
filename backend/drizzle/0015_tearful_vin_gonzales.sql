CREATE TYPE "public"."booking_source" AS ENUM('MANUAL', 'BOOKING_REQUEST', 'TIMETABLE_IMPORT');--> statement-breakpoint
CREATE TYPE "public"."timetable_import_decision_action" AS ENUM('AUTO', 'RESOLVE', 'SKIP');--> statement-breakpoint
CREATE TABLE "timetable_import_row_resolutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"row_id" integer NOT NULL,
	"action" timetable_import_decision_action NOT NULL,
	"resolved_slot_label" text,
	"resolved_room_id" integer,
	"create_slot" jsonb,
	"create_room" jsonb,
	"created_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"already_processed_count" integer DEFAULT 0 NOT NULL,
	"unresolved_count" integer DEFAULT 0 NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "source" "booking_source" DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "slot_blocks" ADD COLUMN "lane_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "timetable_import_row_resolutions" ADD CONSTRAINT "timetable_import_row_resolutions_batch_id_timetable_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."timetable_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_import_row_resolutions" ADD CONSTRAINT "timetable_import_row_resolutions_row_id_timetable_import_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."timetable_import_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_import_row_resolutions" ADD CONSTRAINT "timetable_import_row_resolutions_resolved_room_id_rooms_id_fk" FOREIGN KEY ("resolved_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_import_row_resolutions_batch_row_unique" ON "timetable_import_row_resolutions" USING btree ("batch_id","row_id");