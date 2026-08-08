import { resp } from '@qubitcodes/qcresp';
import { DatabaseLifecycleController } from '@controllers/DatabaseLifecycleController';
import { logicalDatabasePublicIdSchema, renameLogicalDatabaseSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	if (request.method !== 'POST') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const input = await parseJson(request, renameLogicalDatabaseSchema);
	return input instanceof Response ? input : DatabaseLifecycleController.rename(request, workspaceId.data, databaseId.data, input, getRequestMetadata(request));
}
