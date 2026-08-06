import { resp } from '@qubitcodes/qcresp';

import { LogicalDatabaseController } from '@controllers/LogicalDatabaseController';
import { logicalDatabaseNameAvailabilitySchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

/** Checks whether a customer-facing database identifier is unused in the workspace. */
export async function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const input = logicalDatabaseNameAvailabilitySchema.safeParse({ name: new URL(request.url).searchParams.get('name') });
	if (!workspaceId.success) return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (!input.success) return resp.failure('Invalid database name.', resp.codes.VALIDATION_ERROR, input.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })), null, undefined, 400);
	return LogicalDatabaseController.nameAvailability(request, workspaceId.data, input.data.name, getRequestMetadata(request));
}
