import { OPENAPI_DOCUMENT } from '@schemas/openapi';
import {
	apiDocsNotFound,
	authorizeApiDocs,
} from '@services/authorization/apiDocsAuthorizationService';

export class OpenApiController {
	/** Returns the versioned API contract as JSON. */
	public static async show(request: Request): Promise<Response> {
		if (!(await authorizeApiDocs(request))) return apiDocsNotFound();
		return Response.json(OPENAPI_DOCUMENT);
	}
}
