import { ApplicationCronController } from '@controllers/ApplicationCronController';
import { resp } from '@qubitcodes/qcresp';
import { updateApplicationCronSchema } from '@schemas/applicationCron';
import { destructiveActionSchema } from '@schemas/destructiveAction';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { applicationId?: string; cronId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	if (!workspaceId.success || !params.applicationId || !params.cronId) return resp.failure('Scheduled task not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (request.method === 'DELETE') { const confirmation = await parseJson(request, destructiveActionSchema); return confirmation instanceof Response ? confirmation : ApplicationCronController.remove(request, workspaceId.data, params.applicationId, params.cronId, confirmation, getRequestMetadata(request)); }
	const input = await parseJson(request, updateApplicationCronSchema);
	return input instanceof Response ? input : ApplicationCronController.update(request, workspaceId.data, params.applicationId, params.cronId, input, getRequestMetadata(request));
}
