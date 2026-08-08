import { resp } from '@qubitcodes/qcresp';

import { DatabaseAccessController } from '@controllers/DatabaseAccessController';
import { createDatabaseAccessSchema } from '@schemas/databaseAccess';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

interface RouteArgs {
	params: { databaseId?: string; workspaceId?: string };
	request: Request;
}

/** Lists database grants for an authorized workspace database. */
export async function loader({ params, request }: RouteArgs): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	return workspaceId.success && databaseId.success
		? DatabaseAccessController.index(request, workspaceId.data, databaseId.data, getRequestMetadata(request))
		: resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}

/** Creates one new or reusable database-user grant from strict JSON. */
export async function action({ params, request }: RouteArgs): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure(
		'Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404,
	);
	const input = await parseJson(request, createDatabaseAccessSchema);
	return input instanceof Response
		? input
		: DatabaseAccessController.create(request, workspaceId.data, databaseId.data, input, getRequestMetadata(request));
}
