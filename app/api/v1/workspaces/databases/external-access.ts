import { resp } from '@qubitcodes/qcresp';
import { DatabaseLifecycleController } from '@controllers/DatabaseLifecycleController';
import { databaseExternalAccessSchema, logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function loader({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	return DatabaseLifecycleController.externalAccess(request, workspaceId.data, databaseId.data, undefined, getRequestMetadata(request));
}

export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (request.method === 'DELETE') return DatabaseLifecycleController.revokeExternalAccess(request, workspaceId.data, databaseId.data, getRequestMetadata(request));
	if (request.method !== 'PUT') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const input = await parseJson(request, databaseExternalAccessSchema);
	return input instanceof Response ? input : DatabaseLifecycleController.externalAccess(request, workspaceId.data, databaseId.data, input, getRequestMetadata(request));
}
