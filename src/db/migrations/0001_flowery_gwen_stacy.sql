CREATE TYPE "public"."permission_override_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."authentication_event_status" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."authentication_event_type" AS ENUM('otp_requested', 'otp_delivery_failed', 'otp_verification_failed', 'login_succeeded', 'refresh_succeeded', 'session_revoked', 'context_switched');--> statement-breakpoint
CREATE TYPE "public"."otp_channel" AS ENUM('whatsapp');--> statement-breakpoint
CREATE TYPE "public"."otp_delivery_status" AS ENUM('pending', 'submitted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'context_switch', 'sensitive_action');--> statement-breakpoint
CREATE TYPE "public"."session_context_type" AS ENUM('personal', 'admin', 'organisation');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TABLE "platform_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "platform_role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "platform_role_permissions_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"is_system" boolean DEFAULT false NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "platform_user_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"effect" "permission_override_effect" NOT NULL,
	"reason" varchar(500) NOT NULL,
	"assigned_by_user_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "platform_user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "authentication_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"challenge_id" uuid,
	"type" "authentication_event_type" NOT NULL,
	"status" "authentication_event_status" NOT NULL,
	"identity_hash" varchar(64),
	"reason" varchar(500),
	"ip_address" varchar(64),
	"user_agent" varchar(500),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(50) NOT NULL,
	"provider_subject" varchar(255) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"identity_hash" varchar(64) NOT NULL,
	"masked_destination" varchar(32) NOT NULL,
	"channel" "otp_channel" DEFAULT 'whatsapp' NOT NULL,
	"purpose" "otp_purpose" DEFAULT 'login' NOT NULL,
	"otp_hash" varchar(128) NOT NULL,
	"otp_salt" varchar(64) NOT NULL,
	"delivery_status" "otp_delivery_status" DEFAULT 'pending' NOT NULL,
	"provider_reference" varchar(255),
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_available_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"request_ip_hash" varchar(64),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" varchar(128) NOT NULL,
	"active_context_type" "session_context_type" DEFAULT 'personal' NOT NULL,
	"active_organisation_id" uuid,
	"token_version" integer DEFAULT 1 NOT NULL,
	"ip_address" varchar(64),
	"location" varchar(255),
	"user_agent" varchar(500),
	"last_active_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_mobile_number" varchar(32) NOT NULL,
	"country_calling_code" varchar(8) NOT NULL,
	"mobile_e164" varchar(20) NOT NULL,
	"display_name" varchar(160),
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"mobile_verified_at" timestamp with time zone,
	"token_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500)
);
--> statement-breakpoint
ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_role_id_platform_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."platform_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_role_permissions" ADD CONSTRAINT "platform_role_permissions_permission_id_platform_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."platform_permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_user_permission_overrides" ADD CONSTRAINT "platform_user_permission_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_user_permission_overrides" ADD CONSTRAINT "platform_user_permission_overrides_permission_id_platform_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."platform_permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_user_permission_overrides" ADD CONSTRAINT "platform_user_permission_overrides_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_user_roles" ADD CONSTRAINT "platform_user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_user_roles" ADD CONSTRAINT "platform_user_roles_role_id_platform_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."platform_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_user_roles" ADD CONSTRAINT "platform_user_roles_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_events" ADD CONSTRAINT "authentication_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_events" ADD CONSTRAINT "authentication_events_challenge_id_otp_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."otp_challenges"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_permissions_code_unique" ON "platform_permissions" USING btree ("code") WHERE "platform_permissions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "platform_role_permissions_permission_idx" ON "platform_role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_roles_code_unique" ON "platform_roles" USING btree ("code") WHERE "platform_roles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "platform_user_permission_overrides_user_idx" ON "platform_user_permission_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_user_permission_overrides_active_unique" ON "platform_user_permission_overrides" USING btree ("user_id","permission_id") WHERE "platform_user_permission_overrides"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "platform_user_roles_user_idx" ON "platform_user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_user_roles_active_unique" ON "platform_user_roles" USING btree ("user_id","role_id") WHERE "platform_user_roles"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "authentication_events_user_created_idx" ON "authentication_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "authentication_events_identity_created_idx" ON "authentication_events" USING btree ("identity_hash","created_at");--> statement-breakpoint
CREATE INDEX "external_identities_user_idx" ON "external_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_provider_subject_unique" ON "external_identities" USING btree ("provider","provider_subject") WHERE "external_identities"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "otp_challenges_identity_created_idx" ON "otp_challenges" USING btree ("identity_hash","created_at");--> statement-breakpoint
CREATE INDEX "otp_challenges_user_created_idx" ON "otp_challenges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_refresh_token_unique" ON "user_sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "users_local_mobile_idx" ON "users" USING btree ("local_mobile_number");--> statement-breakpoint
CREATE UNIQUE INDEX "users_mobile_e164_unique" ON "users" USING btree ("mobile_e164") WHERE "users"."deleted_at" IS NULL;