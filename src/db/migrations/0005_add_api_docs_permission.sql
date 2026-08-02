INSERT INTO "platform_permissions" ("code", "name", "description")
VALUES (
	'api_docs.view',
	'View API documentation',
	'Access the protected Scalar API reference and OpenAPI contract.'
)
ON CONFLICT ("code") WHERE "deleted_at" IS NULL
DO UPDATE SET
	"name" = EXCLUDED."name",
	"description" = EXCLUDED."description",
	"updated_at" = now();
