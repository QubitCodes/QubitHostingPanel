import { resp } from '@qubitcodes/qcresp';

import { DatabaseExplorerController } from '@controllers/DatabaseExplorerController';
import { cancelDatabaseSessionSchema, databaseDiagnosticsQuerySchema } from '@schemas/databaseDiagnostics';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

/** Returns bounded live health, storage, connection, lock, and index diagnostics. */
export async function loader({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	const input = databaseDiagnosticsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (!input.success) return resp.failure('Validation failed.', resp.codes.VALIDATION_ERROR, input.error.issues, null, undefined, 400);
	return DatabaseExplorerController.diagnostics(request, workspaceId.data, databaseId.data, input.data, getRequestMetadata(request));
}

/** Cancels only a currently active query owned by the selected logical database login. */
export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (request.method !== 'POST') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const input = await parseJson(request, cancelDatabaseSessionSchema);
	return input instanceof Response ? input : DatabaseExplorerController.cancelSession(request, workspaceId.data, databaseId.data, input, getRequestMetadata(request));
}
