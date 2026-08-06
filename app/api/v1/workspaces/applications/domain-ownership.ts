import { resp } from '@qubitcodes/qcresp';

import { ApplicationDomainController } from '@controllers/ApplicationDomainController';
import { registerDomainOwnershipSchema } from '@schemas/application';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	return workspaceId.success ? ApplicationDomainController.ownershipIndex(request, workspaceId.data, getRequestMetadata(request)) : resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}

export async function action({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	if (!workspaceId.success) return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const input = await parseJson(request, registerDomainOwnershipSchema);
	return input instanceof Response ? input : ApplicationDomainController.registerOwnership(request, workspaceId.data, input.hostname, getRequestMetadata(request));
}
