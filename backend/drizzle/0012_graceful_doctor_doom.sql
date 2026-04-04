CREATE TYPE "public"."day_of_week" AS ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');--> statement-breakpoint
CREATE TABLE "slot_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_system_id" integer NOT NULL,
	"day_id" integer NOT NULL,
	"start_band_id" integer NOT NULL,
	"row_span" integer DEFAULT 1 NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_system_id" integer NOT NULL,
	"day_of_week" "day_of_week" NOT NULL,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_systems" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_time_bands" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_system_id" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slot_blocks" ADD CONSTRAINT "slot_blocks_slot_system_id_slot_systems_id_fk" FOREIGN KEY ("slot_system_id") REFERENCES "public"."slot_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_blocks" ADD CONSTRAINT "slot_blocks_day_id_slot_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."slot_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_blocks" ADD CONSTRAINT "slot_blocks_start_band_id_slot_time_bands_id_fk" FOREIGN KEY ("start_band_id") REFERENCES "public"."slot_time_bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_days" ADD CONSTRAINT "slot_days_slot_system_id_slot_systems_id_fk" FOREIGN KEY ("slot_system_id") REFERENCES "public"."slot_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_time_bands" ADD CONSTRAINT "slot_time_bands_slot_system_id_slot_systems_id_fk" FOREIGN KEY ("slot_system_id") REFERENCES "public"."slot_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_day_per_system" ON "slot_days" USING btree ("slot_system_id","day_of_week");--> statement-breakpoint
CREATE UNIQUE INDEX "unique_band_order" ON "slot_time_bands" USING btree ("slot_system_id","order_index");--> statement-breakpoint