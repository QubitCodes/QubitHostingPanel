ALTER TABLE "runtime_images" ADD COLUMN "default_port" integer;--> statement-breakpoint
UPDATE "runtime_images"
SET "default_port" = CASE
	WHEN "language" = 'node' THEN 3000
	WHEN "language" = 'python' THEN 8000
	ELSE 80
END;--> statement-breakpoint
ALTER TABLE "runtime_images" ALTER COLUMN "default_port" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "runtime_images" ADD CONSTRAINT "runtime_images_default_port_check" CHECK ("runtime_images"."default_port" BETWEEN 1 AND 65535);
