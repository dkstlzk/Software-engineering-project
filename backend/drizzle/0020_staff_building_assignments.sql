CREATE TABLE "staff_building_assignments" (
	"staff_id" integer NOT NULL,
	"building_id" integer NOT NULL,
	"assigned_by" integer,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_building_assignments" ADD CONSTRAINT "staff_building_assignments_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_building_assignments" ADD CONSTRAINT "staff_building_assignments_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_building_assignments" ADD CONSTRAINT "staff_building_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_building_assignments_staff_building_unique" ON "staff_building_assignments" USING btree ("staff_id","building_id");--> statement-breakpoint
CREATE INDEX "staff_building_assignments_staff_id_idx" ON "staff_building_assignments" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "staff_building_assignments_building_id_idx" ON "staff_building_assignments" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "staff_building_assignments_assigned_by_idx" ON "staff_building_assignments" USING btree ("assigned_by");