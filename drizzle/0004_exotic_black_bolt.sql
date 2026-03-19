CREATE TABLE "cart_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_oz" numeric(10, 2) NOT NULL,
	"is_subscription" boolean DEFAULT false,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cart_reservations" ADD CONSTRAINT "cart_reservations_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_reservations" ADD CONSTRAINT "cart_reservations_product_id_produce_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."produce"("id") ON DELETE cascade ON UPDATE no action;