ALTER TABLE "users" ADD COLUMN "about_me" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "specialties" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "goal" numeric(10, 2);