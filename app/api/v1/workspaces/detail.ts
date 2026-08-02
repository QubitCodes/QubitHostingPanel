import { resp } from '@qubitcodes/qcresp';

import { WorkspaceController } from '@controllers/WorkspaceController';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

export function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	const parsed = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	return parsed.success
		? WorkspaceController.show(request, parsed.data, getRequestMetadata(request))
		: Promise.resolve(resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404));
}
