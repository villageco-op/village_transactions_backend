ALTER TABLE "produce" ALTER COLUMN "produce_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."produce_type";--> statement-breakpoint
CREATE TYPE "public"."produce_type" AS ENUM('leafy_greens', 'root_vegetables', 'produce_vegetables', 'fruit', 'fresh_herbs', 'mushrooms', 'nuts_seeds_grains', 'farm_pantry');--> statement-breakpoint
ALTER TABLE "produce" ALTER COLUMN "produce_type" SET DATA TYPE "public"."produce_type" USING "produce_type"::"public"."produce_type";