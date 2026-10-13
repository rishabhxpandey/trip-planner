CREATE TABLE "expense_shares" (
	"expense_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"units" integer NOT NULL,
	CONSTRAINT "expense_shares_expense_id_participant_id_pk" PRIMARY KEY("expense_id","participant_id"),
	CONSTRAINT "expense_shares_units_check" CHECK ("expense_shares"."units" > 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" text NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_by" uuid NOT NULL,
	"split" text DEFAULT 'equal' NOT NULL,
	"day" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_check" CHECK ("expenses"."amount_cents" > 0),
	CONSTRAINT "expenses_kind_check" CHECK ("expenses"."kind" IN ('expense', 'payment')),
	CONSTRAINT "expenses_split_check" CHECK ("expenses"."split" IN ('equal', 'nights', 'exact'))
);
--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_participants_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_participants_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_trip_idx" ON "expenses" USING btree ("trip_id");--> statement-breakpoint
-- Same as 0001: keep Supabase's public REST API out; the app connects as the owner.
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expense_shares" ENABLE ROW LEVEL SECURITY;
