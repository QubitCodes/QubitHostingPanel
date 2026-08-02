ALTER TABLE "users" RENAME COLUMN "local_mobile_number" TO "mobile";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "country_calling_code" TO "country_code";--> statement-breakpoint
DROP INDEX "users_mobile_e164_unique";--> statement-breakpoint
DROP INDEX "users_local_mobile_idx";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "mobile_e164";--> statement-breakpoint
CREATE INDEX "users_mobile_idx" ON "users" USING btree ("mobile");--> statement-breakpoint
CREATE UNIQUE INDEX "users_country_mobile_unique" ON "users" USING btree ("country_code","mobile") WHERE "users"."deleted_at" IS NULL;
