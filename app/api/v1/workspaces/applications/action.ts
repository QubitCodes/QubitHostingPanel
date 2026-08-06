import { resp } from '@qubitcodes/qcresp';
import { ApplicationController } from '@controllers/ApplicationController';
import { applicationActionSchema } from '@schemas/application';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

/** Applies one validated customer application lifecycle action. */
export async function action({ params, request }: { params: { applicationId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	if (!workspaceId.success || !params.applicationId) return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const input = await parseJson(request, applicationActionSchema);
	return input instanceof Response ? input : ApplicationController.control(request, workspaceId.data, params.applicationId, input, getRequestMetadata(request));
}
