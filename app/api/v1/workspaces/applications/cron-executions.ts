import { ApplicationCronController } from '@controllers/ApplicationCronController';
import { resp } from '@qubitcodes/qcresp';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

export async function loader({ params, request }: { params: { applicationId?: string; cronId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	return workspaceId.success && params.applicationId && params.cronId ? ApplicationCronController.executions(request, workspaceId.data, params.applicationId, params.cronId, getRequestMetadata(request)) : resp.failure('Scheduled task not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}
