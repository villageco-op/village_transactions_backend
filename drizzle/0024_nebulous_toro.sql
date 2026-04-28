CREATE TABLE "cart_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"is_subscription" boolean DEFAULT false NOT NULL,
	"frequency_days" integer DEFAULT 0 NOT NULL,
	"fulfillment_type" text DEFAULT 'pickup' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cart_reservations" ADD COLUMN "group_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_groups" ADD CONSTRAINT "cart_groups_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_groups" ADD CONSTRAINT "cart_groups_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_reservations" ADD CONSTRAINT "cart_reservations_group_id_cart_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."cart_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_reservations" DROP COLUMN "is_subscription";--> statement-breakpoint
ALTER TABLE "cart_reservations" DROP COLUMN "fulfillment_type";