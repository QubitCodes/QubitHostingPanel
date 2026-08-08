import { resp } from '@qubitcodes/qcresp';

import { DatabaseExplorerController } from '@controllers/DatabaseExplorerController';
import { databaseSchemaMutationSchema } from '@schemas/databaseSchema';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

/** Applies one validated schema mutation to a workspace-owned logical database. */
export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (request.method !== 'POST') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const input = await parseJson(request, databaseSchemaMutationSchema);
	return input instanceof Response
		? input
		: DatabaseExplorerController.schemaMutate(request, workspaceId.data, databaseId.data, input, getRequestMetadata(request));
}
