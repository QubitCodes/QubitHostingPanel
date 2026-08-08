CREATE TYPE "public"."database_external_access_status" AS ENUM('pending', 'active', 'failed', 'revoked');--> statement-breakpoint
CREATE TABLE "database_external_access_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"logical_database_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"status" "database_external_access_status" DEFAULT 'pending' NOT NULL,
	"gateway_port" integer NOT NULL,
	"allowed_cidrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"failure_reason" text,
	"last_synced_at" timestamp with time zone,
	"revision" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "database_external_access_gateway_port_check" CHECK ("database_external_access_rules"."gateway_port" BETWEEN 20000 AND 29999),
	CONSTRAINT "database_external_access_cidrs_check" CHECK (jsonb_array_length("database_external_access_rules"."allowed_cidrs") BETWEEN 1 AND 32)
);
--> statement-breakpoint
ALTER TABLE "database_external_access_rules" ADD CONSTRAINT "database_external_access_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_external_access_rules" ADD CONSTRAINT "database_external_access_rules_logical_database_id_logical_databases_id_fk" FOREIGN KEY ("logical_database_id") REFERENCES "public"."logical_databases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_external_access_rules" ADD CONSTRAINT "database_external_access_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "database_external_access_database_active_unique" ON "database_external_access_rules" USING btree ("logical_database_id") WHERE "database_external_access_rules"."deleted_at" IS NULL AND "database_external_access_rules"."status" <> 'revoked';--> statement-breakpoint
CREATE UNIQUE INDEX "database_external_access_gateway_port_active_unique" ON "database_external_access_rules" USING btree ("gateway_port") WHERE "database_external_access_rules"."deleted_at" IS NULL AND "database_external_access_rules"."status" <> 'revoked';--> statement-breakpoint
CREATE INDEX "database_external_access_workspace_status_idx" ON "database_external_access_rules" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "database_external_access_expiry_idx" ON "database_external_access_rules" USING btree ("expires_at");