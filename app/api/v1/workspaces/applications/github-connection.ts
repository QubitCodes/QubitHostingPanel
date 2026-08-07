import { resp } from '@qubitcodes/qcresp';

import { GithubConnectionController } from '@controllers/GithubConnectionController';
import { deactivateGithubConnectionSchema, githubConnectionIdSchema } from '@schemas/githubConnection';
import { getRequestMetadata } from '@utils/request';

export async function action({ params, request }: { params: { connectionId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	if (request.method !== 'DELETE') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const connectionId = githubConnectionIdSchema.safeParse(params.connectionId);
	if (!connectionId.success) return resp.failure('GitHub connection not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	let payload: unknown;
	try { payload = await request.json(); } catch { return resp.failure('A JSON request body is required.', resp.codes.INVALID_FORMAT, undefined, null, undefined, 400); }
	const input = deactivateGithubConnectionSchema.safeParse(payload);
	if (!input.success) return resp.failure('Validation failed.', resp.codes.VALIDATION_ERROR, input.error.issues, null, undefined, 400);
	return GithubConnectionController.deactivate(request, Number(params.workspaceId), connectionId.data, input.data, getRequestMetadata(request));
}
