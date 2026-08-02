import { OpenApiController } from '@controllers/OpenApiController';

/** Serves the canonical OpenAPI contract consumed by Scalar. */
export const loader = ({ request }: { request: Request }) =>
	OpenApiController.show(request);
