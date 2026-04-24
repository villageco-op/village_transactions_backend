ALTER TYPE "public"."order_status" ADD VALUE 'paid' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'refund_pending' BEFORE 'canceled';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'disputed' BEFORE 'canceled';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_invoice_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_stripe_invoice_id_unique" UNIQUE("stripe_invoice_id");