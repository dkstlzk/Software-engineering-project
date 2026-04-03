CREATE TYPE "public"."notification_type" AS ENUM('BOOKING_REQUEST_CREATED', 'BOOKING_REQUEST_FORWARDED', 'BOOKING_REQUEST_APPROVED', 'BOOKING_REQUEST_REJECTED', 'BOOKING_REQUEST_CANCELLED');--> statement-breakpoint
CREATE TABLE "notifications" (
	"notification_id" serial PRIMARY KEY NOT NULL,
	"recipient_id" integer NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_recipient_id_idx" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_read_idx" ON "notifications" USING btree ("recipient_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_sent_at_idx" ON "notifications" USING btree ("sent_at");