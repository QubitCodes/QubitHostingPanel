import { resp } from '@qubitcodes/qcresp';

import { WorkspaceController } from '@controllers/WorkspaceController';
import { updateWorkspaceCompatibilitySchema, workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	const parsed = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	return parsed.success
		? WorkspaceController.show(request, parsed.data, getRequestMetadata(request))
		: Promise.resolve(resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404));
}

export async function action({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	if (!workspaceId.success) return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (request.method !== 'PATCH') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const input = await parseJson(request, updateWorkspaceCompatibilitySchema);
	return input instanceof Response
		? input
		: WorkspaceController.updateCompatibility(request, workspaceId.data, input, getRequestMetadata(request));
}
