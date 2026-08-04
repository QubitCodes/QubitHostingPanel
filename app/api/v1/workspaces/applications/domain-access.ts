import { resp } from '@qubitcodes/qcresp';

import { ApplicationDomainController } from '@controllers/ApplicationDomainController';
import { domainAccessActionSchema } from '@schemas/application';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { requestId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	if (!workspaceId.success || !params.requestId) return resp.failure('Domain access request not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const input = await parseJson(request, domainAccessActionSchema);
	return input instanceof Response ? input : ApplicationDomainController.respondToAccess(request, workspaceId.data, params.requestId, input.action, getRequestMetadata(request));
}
