CREATE TYPE "public"."slot_change_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "booking_course_link" (
	"booking_id" integer NOT NULL,
	"course_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_enrollments" (
	"course_id" integer NOT NULL,
	"student_id" integer NOT NULL,
	"enrolled_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_faculty" (
	"course_id" integer NOT NULL,
	"faculty_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"credits" integer NOT NULL,
	"description" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_change_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"requested_by" integer NOT NULL,
	"course_id" integer NOT NULL,
	"current_booking_id" integer NOT NULL,
	"proposed_room_id" integer,
	"proposed_start" timestamp with time zone NOT NULL,
	"proposed_end" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"status" "slot_change_request_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" integer,
	"review_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "slot_change_requests_valid_proposed_range_check" CHECK ("slot_change_requests"."proposed_end" > "slot_change_requests"."proposed_start")
);
--> statement-breakpoint
ALTER TABLE "booking_requests" ADD COLUMN "faculty_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "registered_via" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_login" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_course_link" ADD CONSTRAINT "booking_course_link_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_course_link" ADD CONSTRAINT "booking_course_link_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_faculty" ADD CONSTRAINT "course_faculty_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_faculty" ADD CONSTRAINT "course_faculty_faculty_id_users_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_change_requests" ADD CONSTRAINT "slot_change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_change_requests" ADD CONSTRAINT "slot_change_requests_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_change_requests" ADD CONSTRAINT "slot_change_requests_current_booking_id_bookings_id_fk" FOREIGN KEY ("current_booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_change_requests" ADD CONSTRAINT "slot_change_requests_proposed_room_id_rooms_id_fk" FOREIGN KEY ("proposed_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_change_requests" ADD CONSTRAINT "slot_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_course_link_booking_id_course_id_unique" ON "booking_course_link" USING btree ("booking_id","course_id");--> statement-breakpoint
CREATE INDEX "booking_course_link_booking_id_idx" ON "booking_course_link" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_course_link_course_id_idx" ON "booking_course_link" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_enrollments_course_id_student_id_unique" ON "course_enrollments" USING btree ("course_id","student_id");--> statement-breakpoint
CREATE INDEX "course_enrollments_course_id_idx" ON "course_enrollments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_enrollments_student_id_idx" ON "course_enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_faculty_course_id_faculty_id_unique" ON "course_faculty" USING btree ("course_id","faculty_id");--> statement-breakpoint
CREATE INDEX "course_faculty_course_id_idx" ON "course_faculty" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_faculty_faculty_id_idx" ON "course_faculty" USING btree ("faculty_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_code_unique" ON "courses" USING btree ("code");--> statement-breakpoint
CREATE INDEX "courses_created_by_idx" ON "courses" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "courses_department_idx" ON "courses" USING btree ("department");--> statement-breakpoint
CREATE INDEX "courses_name_idx" ON "courses" USING btree ("name");--> statement-breakpoint
CREATE INDEX "courses_is_active_idx" ON "courses" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "slot_change_requests_requested_by_idx" ON "slot_change_requests" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "slot_change_requests_course_id_idx" ON "slot_change_requests" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "slot_change_requests_current_booking_id_idx" ON "slot_change_requests" USING btree ("current_booking_id");--> statement-breakpoint
CREATE INDEX "slot_change_requests_proposed_room_id_idx" ON "slot_change_requests" USING btree ("proposed_room_id");--> statement-breakpoint
CREATE INDEX "slot_change_requests_reviewed_by_idx" ON "slot_change_requests" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "slot_change_requests_status_idx" ON "slot_change_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "slot_change_requests_proposed_start_idx" ON "slot_change_requests" USING btree ("proposed_start");--> statement-breakpoint
CREATE INDEX "slot_change_requests_proposed_end_idx" ON "slot_change_requests" USING btree ("proposed_end");--> statement-breakpoint
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_faculty_id_users_id_fk" FOREIGN KEY ("faculty_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_requests_user_id_idx" ON "booking_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "booking_requests_faculty_id_idx" ON "booking_requests" USING btree ("faculty_id");--> statement-breakpoint
CREATE INDEX "booking_requests_room_id_idx" ON "booking_requests" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "booking_requests_status_idx" ON "booking_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_id_unique" ON "users" USING btree ("google_id");--> statement-breakpoint
CREATE INDEX "users_department_idx" ON "users" USING btree ("department");--> statement-breakpoint
CREATE INDEX "users_is_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "users_registered_via_idx" ON "users" USING btree ("registered_via");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_registered_via_allowed_check" CHECK ("users"."registered_via" IN ('email', 'google'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_email_domain_check" CHECK ("users"."registered_via" <> 'google' OR lower("users"."email") LIKE '%@iitj.ac.in');--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."enforce_slot_change_requested_by_faculty"()
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
		RAISE EXCEPTION 'slot_change_requests.requested_by must reference a FACULTY user';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "slot_change_requests_requested_by_faculty_trg"
BEFORE INSERT OR UPDATE OF "requested_by"
ON "slot_change_requests"
FOR EACH ROW
EXECUTE FUNCTION "public"."enforce_slot_change_requested_by_faculty"();