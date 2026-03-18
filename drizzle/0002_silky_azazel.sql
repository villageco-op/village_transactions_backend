CREATE TYPE "public"."produce_status" AS ENUM('active', 'paused', 'deleted');--> statement-breakpoint
CREATE TABLE "produce" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" text NOT NULL,
	"title" text NOT NULL,
	"produce_type" text,
	"price_per_oz" numeric(10, 2) NOT NULL,
	"total_oz_inventory" numeric(10, 2) NOT NULL,
	"harvest_frequency_days" integer NOT NULL,
	"season_start" date NOT NULL,
	"season_end" date NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb,
	"is_subscribable" boolean DEFAULT false,
	"status" "produce_status" DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "produce" ADD CONSTRAINT "produce_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;