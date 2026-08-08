import { resp } from '@qubitcodes/qcresp';

import { DatabaseSavedQueryController } from '@controllers/DatabaseSavedQueryController';
import { databaseSavedQueryIdSchema, databaseSavedQueryUpdateSchema } from '@schemas/databaseQuery';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { databaseId?: string; savedQueryId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	const savedQueryId = databaseSavedQueryIdSchema.safeParse(params.savedQueryId);
	if (!workspaceId.success || !databaseId.success || !savedQueryId.success) return resp.failure('Saved query not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const metadata = getRequestMetadata(request);
	if (request.method === 'DELETE') return DatabaseSavedQueryController.remove(request, workspaceId.data, databaseId.data, savedQueryId.data, metadata);
	if (request.method !== 'PATCH') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const input = await parseJson(request, databaseSavedQueryUpdateSchema);
	return input instanceof Response ? input : DatabaseSavedQueryController.update(request, workspaceId.data, databaseId.data, savedQueryId.data, input, metadata);
}
