CREATE TABLE "trip_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" text NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "trip_files_size_check" CHECK ("trip_files"."size" > 0)
);
--> statement-breakpoint
ALTER TABLE "trip_files" ADD CONSTRAINT "trip_files_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_files" ADD CONSTRAINT "trip_files_uploaded_by_participants_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_files_trip_idx" ON "trip_files" USING btree ("trip_id");--> statement-breakpoint
-- Same as 0001: keep Supabase's public REST API out; the app connects as the owner.
ALTER TABLE "trip_files" ENABLE ROW LEVEL SECURITY;
