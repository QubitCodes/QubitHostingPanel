import { resp } from '@qubitcodes/qcresp';
import { ApplicationController } from '@controllers/ApplicationController';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

/** Lists package-limited deployment history for one workspace application. */
export async function loader({ params, request }: { params: { applicationId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	return workspaceId.success && params.applicationId ? ApplicationController.deployments(request, workspaceId.data, params.applicationId, getRequestMetadata(request)) : resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}
