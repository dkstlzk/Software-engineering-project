CREATE TYPE "public"."timetable_import_batch_status" AS ENUM('PREVIEWED', 'COMMITTED');--> statement-breakpoint
CREATE TYPE "public"."timetable_import_occurrence_status" AS ENUM('PENDING', 'CREATED', 'FAILED', 'SKIPPED', 'UNRESOLVED', 'ALREADY_PROCESSED');--> statement-breakpoint
CREATE TYPE "public"."timetable_import_row_status" AS ENUM('VALID_AND_AUTOMATABLE', 'UNRESOLVED_SLOT', 'UNRESOLVED_ROOM', 'AMBIGUOUS_CLASSROOM', 'DUPLICATE_ROW', 'CONFLICTING_MAPPING', 'MISSING_REQUIRED_FIELD', 'OTHER_PROCESSING_ERROR');--> statement-breakpoint
CREATE TABLE "timetable_import_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_key" text NOT NULL,
	"slot_system_id" integer NOT NULL,
	"term_start_date" timestamp NOT NULL,
	"term_end_date" timestamp NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"fingerprint" text NOT NULL,
	"alias_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" timetable_import_batch_status DEFAULT 'PREVIEWED' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"committed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "timetable_import_occurrences" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"row_id" integer NOT NULL,
	"room_id" integer NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"source" text DEFAULT 'TIMETABLE_IMPORT' NOT NULL,
	"source_ref" text,
	"dedupe_key" text NOT NULL,
	"booking_id" integer,
	"status" timetable_import_occurrence_status DEFAULT 'PENDING' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timetable_import_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"row_index" integer NOT NULL,
	"raw_row" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_course_code" text,
	"raw_slot" text,
	"raw_classroom" text,
	"normalized_course_code" text,
	"normalized_slot" text,
	"normalized_classroom" text,
	"classification" timetable_import_row_status NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parsed_building" text,
	"parsed_room" text,
	"resolved_slot_label" text,
	"resolved_room_id" integer,
	"row_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slot_days" ADD COLUMN "lane_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "timetable_import_batches" ADD CONSTRAINT "timetable_import_batches_slot_system_id_slot_systems_id_fk" FOREIGN KEY ("slot_system_id") REFERENCES "public"."slot_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_import_occurrences" ADD CONSTRAINT "timetable_import_occurrences_batch_id_timetable_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."timetable_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_import_occurrences" ADD CONSTRAINT "timetable_import_occurrences_row_id_timetable_import_rows_id_fk" FOREIGN KEY ("row_id") REFERENCES "public"."timetable_import_rows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_import_occurrences" ADD CONSTRAINT "timetable_import_occurrences_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_import_occurrences" ADD CONSTRAINT "timetable_import_occurrences_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_import_rows" ADD CONSTRAINT "timetable_import_rows_batch_id_timetable_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."timetable_import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_import_rows" ADD CONSTRAINT "timetable_import_rows_resolved_room_id_rooms_id_fk" FOREIGN KEY ("resolved_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_import_batches_batch_key_unique" ON "timetable_import_batches" USING btree ("batch_key");--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_import_batches_fingerprint_unique" ON "timetable_import_batches" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_import_occurrences_dedupe_key_unique" ON "timetable_import_occurrences" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "timetable_import_rows_batch_row_unique" ON "timetable_import_rows" USING btree ("batch_id","row_index");