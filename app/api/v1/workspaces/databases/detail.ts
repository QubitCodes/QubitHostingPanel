import { LogicalDatabaseController } from '@controllers/LogicalDatabaseController';
import { deleteLogicalDatabaseSchema, logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';
import { resp } from '@qubitcodes/qcresp';

/** Deletes one workspace database after strict typed dependency confirmation. */
export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	if (request.method !== 'DELETE') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const input = await parseJson(request, deleteLogicalDatabaseSchema);
	return input instanceof Response ? input : LogicalDatabaseController.destroy(request, workspaceId.data, databaseId.data, input, getRequestMetadata(request));
}
