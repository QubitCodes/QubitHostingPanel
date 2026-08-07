CREATE TYPE "public"."database_user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "database_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cluster_id" uuid NOT NULL,
	"status" "database_user_status" DEFAULT 'active' NOT NULL,
	"username" varchar(120) NOT NULL,
	"credential_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
DROP INDEX "logical_databases_cluster_username_active_unique";--> statement-breakpoint
ALTER TABLE "logical_databases" ADD COLUMN "database_user_id" uuid;--> statement-breakpoint
ALTER TABLE "database_users" ADD CONSTRAINT "database_users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_users" ADD CONSTRAINT "database_users_cluster_id_database_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."database_clusters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
INSERT INTO "database_users" ("workspace_id", "cluster_id", "status", "username", "credential_ciphertext", "created_at", "updated_at")
SELECT "workspace_id", "cluster_id", 'active', "username", "credential_ciphertext", "created_at", "updated_at"
FROM "logical_databases"
WHERE "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "logical_databases" AS database
SET "database_user_id" = database_user."id"
FROM "database_users" AS database_user
WHERE database."workspace_id" = database_user."workspace_id"
	AND database."cluster_id" = database_user."cluster_id"
	AND database."username" = database_user."username"
	AND database."deleted_at" IS NULL
	AND database_user."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "database_users_cluster_username_active_unique" ON "database_users" USING btree ("cluster_id","username") WHERE "database_users"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "database_users_workspace_status_idx" ON "database_users" USING btree ("workspace_id","status");--> statement-breakpoint
ALTER TABLE "logical_databases" ADD CONSTRAINT "logical_databases_database_user_id_database_users_id_fk" FOREIGN KEY ("database_user_id") REFERENCES "public"."database_users"("id") ON DELETE restrict ON UPDATE no action;
