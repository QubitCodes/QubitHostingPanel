CREATE TABLE "authentication_handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_session_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"target_origin" varchar(500) NOT NULL,
	"target_path" varchar(500) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "authentication_handoffs" ADD CONSTRAINT "authentication_handoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_handoffs" ADD CONSTRAINT "authentication_handoffs_source_session_id_user_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."user_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "authentication_handoffs_token_hash_unique" ON "authentication_handoffs" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "authentication_handoffs_user_expires_idx" ON "authentication_handoffs" USING btree ("user_id","expires_at");