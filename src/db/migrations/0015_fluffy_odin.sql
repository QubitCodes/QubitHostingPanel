CREATE TYPE "public"."customer_onboarding_status" AS ENUM('pending', 'complete');--> statement-breakpoint
CREATE TYPE "public"."workspace_membership_role" AS ENUM('owner', 'administrator', 'billing_manager', 'member');--> statement-breakpoint
CREATE TYPE "public"."workspace_membership_status" AS ENUM('invited', 'active', 'suspended', 'left');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."workspace_type" AS ENUM('personal', 'organisation');--> statement-breakpoint
CREATE SEQUENCE "public"."customer_public_id_seq" INCREMENT BY 1 MINVALUE 100000 MAXVALUE 999999 START WITH 100000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."workspace_public_id_seq" INCREMENT BY 1 MINVALUE 100000 MAXVALUE 999999 START WITH 100000 CACHE 1;--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" integer DEFAULT nextval('customer_public_id_seq') NOT NULL,
	"user_id" uuid NOT NULL,
	"onboarding_status" "customer_onboarding_status" DEFAULT 'pending' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "customers_public_id_check" CHECK ("customers"."public_id" BETWEEN 100000 AND 999999)
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"legal_name" varchar(200),
	"gstin" varchar(15),
	"contact_email" varchar(320),
	"contact_country_code" varchar(8),
	"contact_mobile" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "organisations_gstin_check" CHECK ("organisations"."gstin" IS NULL OR "organisations"."gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"role" "workspace_membership_role" DEFAULT 'owner' NOT NULL,
	"status" "workspace_membership_status" DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ownership_started_at" timestamp with time zone,
	"ownership_ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "workspace_memberships_ownership_dates_check" CHECK ("workspace_memberships"."ownership_ended_at" IS NULL OR "workspace_memberships"."ownership_started_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" integer DEFAULT nextval('workspace_public_id_seq') NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(160) NOT NULL,
	"type" "workspace_type" DEFAULT 'personal' NOT NULL,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"delete_reason" varchar(500),
	CONSTRAINT "workspaces_public_id_check" CHECK ("workspaces"."public_id" BETWEEN 100000 AND 999999),
	CONSTRAINT "workspaces_slug_check" CHECK ("workspaces"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_public_id_unique" ON "customers" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_active_unique" ON "customers" USING btree ("user_id") WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_workspace_active_unique" ON "organisations" USING btree ("workspace_id") WHERE "organisations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "organisations_display_name_idx" ON "organisations" USING btree ("display_name");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_memberships_active_unique" ON "workspace_memberships" USING btree ("workspace_id","customer_id") WHERE "workspace_memberships"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workspace_memberships_customer_status_idx" ON "workspace_memberships" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "workspace_memberships_workspace_status_idx" ON "workspace_memberships" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_public_id_unique" ON "workspaces" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_slug_active_unique" ON "workspaces" USING btree ("slug") WHERE "workspaces"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "workspaces_type_status_idx" ON "workspaces" USING btree ("type","status");