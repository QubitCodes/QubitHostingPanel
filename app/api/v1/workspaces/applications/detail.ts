import { resp } from '@qubitcodes/qcresp';
import { ApplicationController } from '@controllers/ApplicationController';
import { updateApplicationSchema } from '@schemas/application';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

/** Update one workspace-owned application configuration. */
export async function action({ params, request }: { params: { applicationId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	if (!workspaceId.success || !params.applicationId) return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const input = await parseJson(request, updateApplicationSchema);
	return input instanceof Response ? input : ApplicationController.update(request, workspaceId.data, params.applicationId, input, getRequestMetadata(request));
}
