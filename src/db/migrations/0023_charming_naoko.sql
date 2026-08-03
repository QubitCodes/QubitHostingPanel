CREATE TYPE "public"."database_tls_mode" AS ENUM('disabled', 'require', 'verify-full');--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "management_host" varchar(255);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "management_port" integer;--> statement-breakpoint
ALTER TABLE "database_clusters" ADD COLUMN "management_tls_mode" "database_tls_mode" DEFAULT 'disabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "database_clusters" ADD CONSTRAINT "database_clusters_management_port_check" CHECK ("database_clusters"."management_port" IS NULL OR "database_clusters"."management_port" BETWEEN 1 AND 65535);--> statement-breakpoint
ALTER TABLE "database_clusters" ADD CONSTRAINT "database_clusters_management_endpoint_check" CHECK (("database_clusters"."management_host" IS NULL AND "database_clusters"."management_port" IS NULL) OR ("database_clusters"."management_host" IS NOT NULL AND "database_clusters"."management_port" IS NOT NULL));