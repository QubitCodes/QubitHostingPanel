import { resp } from '@qubitcodes/qcresp';

import { ApplicationSettingsController } from '@controllers/ApplicationSettingsController';
import { updateApplicationSettingsSchema } from '@schemas/applicationSettings';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

/** Retrieve or update one workspace-owned application's release and site settings. */
export async function loader({ params, request }: { params: { applicationId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	if (!workspaceId.success || !params.applicationId)
		return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	return ApplicationSettingsController.show(request, workspaceId.data, params.applicationId, getRequestMetadata(request));
}

export async function action({ params, request }: { params: { applicationId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	if (!workspaceId.success || !params.applicationId)
		return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const input = await parseJson(request, updateApplicationSettingsSchema);
	return input instanceof Response ? input : ApplicationSettingsController.update(request, workspaceId.data, params.applicationId, input, getRequestMetadata(request));
}
