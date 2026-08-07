import { resp } from '@qubitcodes/qcresp';

import { DatabaseExplorerController } from '@controllers/DatabaseExplorerController';
import { databaseExplorerDeleteRowsSchema, databaseExplorerInsertRowSchema, databaseExplorerRowsQuerySchema, databaseExplorerUpdateRowSchema } from '@schemas/databaseExplorer';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

/** Reads one bounded, server-paginated database object result set. */
export async function loader({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	const input = databaseExplorerRowsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (!input.success) return resp.failure('Validation failed.', resp.codes.VALIDATION_ERROR, input.error.issues, null, undefined, 400);
	return DatabaseExplorerController.rows(request, workspaceId.data, databaseId.data, input.data, getRequestMetadata(request));
}

/** Inserts, updates, or deletes bounded table rows after strict JSON validation. */
export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (!['DELETE', 'PATCH', 'POST'].includes(request.method)) return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	if (request.method === 'POST') {
		const input = await parseJson(request, databaseExplorerInsertRowSchema);
		return input instanceof Response ? input : DatabaseExplorerController.mutate(request, workspaceId.data, databaseId.data, 'insert', input, getRequestMetadata(request));
	}
	if (request.method === 'PATCH') {
		const input = await parseJson(request, databaseExplorerUpdateRowSchema);
		return input instanceof Response ? input : DatabaseExplorerController.mutate(request, workspaceId.data, databaseId.data, 'update', input, getRequestMetadata(request));
	}
	const input = await parseJson(request, databaseExplorerDeleteRowsSchema);
	return input instanceof Response ? input : DatabaseExplorerController.mutate(request, workspaceId.data, databaseId.data, 'delete', input, getRequestMetadata(request));
}
