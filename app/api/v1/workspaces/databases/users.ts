import { resp } from '@qubitcodes/qcresp';

import { LogicalDatabaseController } from '@controllers/LogicalDatabaseController';
import { logicalDatabaseUserQuerySchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

/** Returns reusable, non-secret database users for one authorized workspace. */
export async function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const query = logicalDatabaseUserQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
	if (!workspaceId.success || !query.success) return resp.failure('Workspace database users are unavailable.', resp.codes.VALIDATION_ERROR, query.success ? undefined : query.error.issues, null, undefined, 400);
	return LogicalDatabaseController.users(request, workspaceId.data, query.data.engine, getRequestMetadata(request));
}
