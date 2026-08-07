import { resp } from '@qubitcodes/qcresp';

import { LogicalDatabaseController } from '@controllers/LogicalDatabaseController';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { getRequestMetadata } from '@utils/request';

/** Resolves a database-manager tab to its authorized workspace context. */
export async function loader({ params, request }: { params: { databaseId?: string }; request: Request }): Promise<Response> {
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	return databaseId.success ? LogicalDatabaseController.context(request, databaseId.data, getRequestMetadata(request)) : resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}
