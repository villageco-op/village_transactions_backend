CREATE TYPE "public"."org_type" AS ENUM('pantry', 'restaurant');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "org_type" NOT NULL,
	"name" text NOT NULL,
	"subdomain" text NOT NULL,
	"email" text,
	"website" text,
	"phone" text,
	"image" text,
	"address" text,
	"city" text,
	"state" text,
	"country" text,
	"zip" text,
	"lat" double precision,
	"lng" double precision,
	"location" "geography",
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "organizations_subdomain_unique" UNIQUE("subdomain"),
	CONSTRAINT "organizations_email_unique" UNIQUE("email")
);
