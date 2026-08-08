CREATE TABLE "database_saved_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"logical_database_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"query_ciphertext" text NOT NULL,
	"allow_changes" boolean DEFAULT false NOT NULL,
	"row_limit" integer DEFAULT 100 NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"execution_count" integer DEFAULT 0 NOT NULL,
	"last_executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "database_saved_queries" ADD CONSTRAINT "database_saved_queries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_saved_queries" ADD CONSTRAINT "database_saved_queries_logical_database_id_logical_databases_id_fk" FOREIGN KEY ("logical_database_id") REFERENCES "public"."logical_databases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_saved_queries" ADD CONSTRAINT "database_saved_queries_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "database_saved_queries_owner_name_active_unique" ON "database_saved_queries" USING btree ("logical_database_id","owner_user_id","name") WHERE "database_saved_queries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "database_saved_queries_owner_database_favorite_idx" ON "database_saved_queries" USING btree ("owner_user_id","logical_database_id","is_favorite");--> statement-breakpoint
CREATE INDEX "database_saved_queries_workspace_database_idx" ON "database_saved_queries" USING btree ("workspace_id","logical_database_id");