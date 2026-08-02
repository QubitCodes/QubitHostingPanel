CREATE TABLE "email_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"source" varchar(60) DEFAULT 'amazon_ses' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "email_usage_records_recipient_count_check" CHECK ("email_usage_records"."recipient_count" >= 0),
	CONSTRAINT "email_usage_records_period_check" CHECK ("email_usage_records"."period_end" > "email_usage_records"."period_start")
);
--> statement-breakpoint
ALTER TABLE "email_usage_records" ADD CONSTRAINT "email_usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_usage_records_user_period_unique" ON "email_usage_records" USING btree ("user_id","period_start","period_end") WHERE "email_usage_records"."deleted_at" IS NULL;