import { resp } from '@qubitcodes/qcresp';

import { GithubConnectionController } from '@controllers/GithubConnectionController';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

/** Reconciles installed GitHub accounts and repository access for one authorized workspace. */
export async function action({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	if (request.method !== 'POST') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	return workspaceId.success
		? GithubConnectionController.reconcile(request, workspaceId.data, getRequestMetadata(request))
		: resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}
