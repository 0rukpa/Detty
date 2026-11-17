ALTER TABLE "users" ADD COLUMN "early_access_debt_kobo" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "provider" text DEFAULT 'stripe' NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "early" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "withdrawals" ADD COLUMN "failure_reason" text;