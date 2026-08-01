import { OPENAPI_DOCUMENT } from '@schemas/openapi';

export class OpenApiController {
	/** Returns the versioned API contract as JSON. */
	public static show(): Response {
		return Response.json(OPENAPI_DOCUMENT);
	}
}
