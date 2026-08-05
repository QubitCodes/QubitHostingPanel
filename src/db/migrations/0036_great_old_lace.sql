CREATE TABLE "dns_provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "dns_provider" NOT NULL,
	"account_identifier" varchar(255),
	"token_ciphertext" text NOT NULL,
	"token_suffix" varchar(12) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"last_validated_at" timestamp with time zone,
	"last_error" text,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "dns_provider_connections" ADD CONSTRAINT "dns_provider_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dns_provider_connections" ADD CONSTRAINT "dns_provider_connections_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dns_provider_connections_active_unique" ON "dns_provider_connections" USING btree ("provider") WHERE "dns_provider_connections"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "dns_provider_connections_status_idx" ON "dns_provider_connections" USING btree ("provider","status");