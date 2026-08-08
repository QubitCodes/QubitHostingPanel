import { resp } from '@qubitcodes/qcresp';

import { PlatformDeploymentController } from '@controllers/PlatformDeploymentController';
import { platformDeploymentIdSchema } from '@schemas/platformDeployment';
import { getRequestMetadata } from '@utils/request';

export function loader({
	params,
	request,
}: {
	params: { deploymentId?: string };
	request: Request;
}): Promise<Response> | Response {
	const deploymentId = platformDeploymentIdSchema.safeParse(params.deploymentId);
	return deploymentId.success
		? PlatformDeploymentController.show(
				request,
				deploymentId.data,
				getRequestMetadata(request),
			)
		: resp.failure(
				'Platform deployment not found.',
				resp.codes.RESOURCE_NOT_FOUND,
				undefined,
				null,
				undefined,
				404,
			);
}
