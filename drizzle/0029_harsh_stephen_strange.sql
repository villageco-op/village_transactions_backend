CREATE TYPE "public"."org_invite_status" AS ENUM('pending', 'accepted', 'expired');--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "status" "org_invite_status" DEFAULT 'pending' NOT NULL;