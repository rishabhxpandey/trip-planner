ALTER TABLE "trips" ADD COLUMN "locked_start" date;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "locked_end" date;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "locked_destination_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "locked_by" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_locked_destination_id_destinations_id_fk" FOREIGN KEY ("locked_destination_id") REFERENCES "public"."destinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_locked_by_participants_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_locked_dates_check" CHECK (("trips"."locked_start" IS NULL) = ("trips"."locked_end" IS NULL) AND ("trips"."locked_end" IS NULL OR "trips"."locked_end" >= "trips"."locked_start"));