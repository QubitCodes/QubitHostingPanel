import { resp } from '@qubitcodes/qcresp';

import { DatabaseExplorerController } from '@controllers/DatabaseExplorerController';
import { databaseExplorerObjectQuerySchema } from '@schemas/databaseExplorer';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

/** Lists tenant-visible database objects and optionally describes one object. */
export async function loader({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	const input = databaseExplorerObjectQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (!input.success) return resp.failure('Validation failed.', resp.codes.VALIDATION_ERROR, input.error.issues, null, undefined, 400);
	return DatabaseExplorerController.objects(request, workspaceId.data, databaseId.data, input.data, getRequestMetadata(request));
}
