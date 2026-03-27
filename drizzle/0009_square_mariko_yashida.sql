CREATE TYPE "public"."schedule_type" AS ENUM('pickup', 'delivery');--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD COLUMN "type" "schedule_type" DEFAULT 'pickup';