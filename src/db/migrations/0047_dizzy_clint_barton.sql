CREATE TYPE "public"."database_access_level" AS ENUM('owner', 'read_only', 'read_write', 'custom');--> statement-breakpoint
CREATE TYPE "public"."database_grant_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TABLE "database_user_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"logical_database_id" uuid NOT NULL,
	"database_user_id" uuid NOT NULL,
	"access_level" "database_access_level" NOT NULL,
	"status" "database_grant_status" DEFAULT 'active' NOT NULL,
	"privileges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"granted_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revoke_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "database_user_grants_expiry_check" CHECK ("database_user_grants"."expires_at" IS NULL OR "database_user_grants"."expires_at" > "database_user_grants"."created_at")
);
--> statement-breakpoint
ALTER TABLE "database_user_grants" ADD CONSTRAINT "database_user_grants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_user_grants" ADD CONSTRAINT "database_user_grants_logical_database_id_logical_databases_id_fk" FOREIGN KEY ("logical_database_id") REFERENCES "public"."logical_databases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_user_grants" ADD CONSTRAINT "database_user_grants_database_user_id_database_users_id_fk" FOREIGN KEY ("database_user_id") REFERENCES "public"."database_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_user_grants" ADD CONSTRAINT "database_user_grants_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_user_grants" ADD CONSTRAINT "database_user_grants_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "database_user_grants" ("workspace_id", "logical_database_id", "database_user_id", "access_level", "status", "privileges", "scopes")
SELECT "workspace_id", "id", "database_user_id", 'owner', 'active', '["select","insert","update","delete"]'::jsonb, '[]'::jsonb
FROM "logical_databases"
WHERE "database_user_id" IS NOT NULL AND "deleted_at" IS NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE UNIQUE INDEX "database_user_grants_database_user_active_unique" ON "database_user_grants" USING btree ("logical_database_id","database_user_id") WHERE "database_user_grants"."revoked_at" IS NULL AND "database_user_grants"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "database_user_grants_workspace_database_status_idx" ON "database_user_grants" USING btree ("workspace_id","logical_database_id","status");--> statement-breakpoint
CREATE INDEX "database_user_grants_user_status_idx" ON "database_user_grants" USING btree ("database_user_id","status");
