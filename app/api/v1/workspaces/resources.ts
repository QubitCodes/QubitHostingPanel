import { resp } from '@qubitcodes/qcresp';

import { ProvisioningController } from '@controllers/ProvisioningController';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

export async function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	const parsed = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	return parsed.success ? ProvisioningController.workspaceResources(request, parsed.data, getRequestMetadata(request)) : resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}
