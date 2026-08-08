import { PlatformDeploymentController } from '@controllers/PlatformDeploymentController';
import { createPlatformDeploymentSchema } from '@schemas/platformDeployment';
import { getRequestMetadata, parseJson } from '@utils/request';

export function loader({ request }: { request: Request }): Promise<Response> {
	return PlatformDeploymentController.index(request, getRequestMetadata(request));
}

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, createPlatformDeploymentSchema);
	return input instanceof Response
		? input
		: PlatformDeploymentController.create(
				request,
				input,
				getRequestMetadata(request),
			);
}
