import { resp } from '@qubitcodes/qcresp';

import { ApplicationDomainController } from '@controllers/ApplicationDomainController';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

export async function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	return workspaceId.success ? ApplicationDomainController.ownershipIndex(request, workspaceId.data, getRequestMetadata(request)) : resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}
