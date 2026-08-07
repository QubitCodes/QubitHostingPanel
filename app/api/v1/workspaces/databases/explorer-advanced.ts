import { resp } from '@qubitcodes/qcresp';

import { DatabaseExplorerController } from '@controllers/DatabaseExplorerController';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

/** Lists read-only routines, triggers, sequences, and events for one database. */
export async function loader({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	return DatabaseExplorerController.advancedObjects(request, workspaceId.data, databaseId.data, getRequestMetadata(request));
}
