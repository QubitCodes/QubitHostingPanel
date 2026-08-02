CREATE SEQUENCE "public"."user_public_id_seq" INCREMENT BY 1 MINVALUE 100000 MAXVALUE 999999 START WITH 100000 CACHE 1;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "public_id" integer DEFAULT nextval('user_public_id_seq') NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_public_id_unique" ON "users" USING btree ("public_id");
--> statement-breakpoint
UPDATE "platform_permissions"
SET "name" = initcap(split_part("code", '.', 2)) || ' ' || split_part("code", '.', 1),
	"updated_at" = now()
WHERE "code" LIKE '%.%';
