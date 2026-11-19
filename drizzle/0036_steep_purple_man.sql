CREATE TYPE "public"."buyer_report" AS ENUM('received', 'not_received');--> statement-breakpoint
CREATE TYPE "public"."seller_report" AS ENUM('fulfilled');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_report" "buyer_report";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "seller_report" "seller_report";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "seller_reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "status_updated_at" timestamp with time zone;