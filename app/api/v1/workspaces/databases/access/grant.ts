import { resp } from '@qubitcodes/qcresp';
import { z } from 'zod';

import { DatabaseAccessController } from '@controllers/DatabaseAccessController';
import { revokeDatabaseGrantSchema, updateDatabaseGrantSchema } from '@schemas/databaseAccess';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

interface RouteArgs {
	params: { databaseId?: string; grantId?: string; workspaceId?: string };
	request: Request;
}

/** Updates or revokes a non-owner grant using method-specific validation. */
export async function action({ params, request }: RouteArgs): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	const grantId = z.uuid().safeParse(params.grantId);
	if (!workspaceId.success || !databaseId.success || !grantId.success) return resp.failure(
		'Database grant not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404,
	);
	if (request.method === 'PATCH') {
		const input = await parseJson(request, updateDatabaseGrantSchema);
		return input instanceof Response
			? input
			: DatabaseAccessController.update(request, workspaceId.data, databaseId.data, grantId.data, input, getRequestMetadata(request));
	}
	if (request.method === 'DELETE') {
		const input = await parseJson(request, revokeDatabaseGrantSchema);
		return input instanceof Response
			? input
			: DatabaseAccessController.revoke(request, workspaceId.data, databaseId.data, grantId.data, input, getRequestMetadata(request));
	}
	return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
}
