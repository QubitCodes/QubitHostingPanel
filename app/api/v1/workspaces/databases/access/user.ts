import { resp } from '@qubitcodes/qcresp';
import { z } from 'zod';

import { DatabaseAccessController } from '@controllers/DatabaseAccessController';
import { databaseUserActionSchema } from '@schemas/databaseAccess';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

interface RouteArgs {
	params: { databaseId?: string; databaseUserId?: string; workspaceId?: string };
	request: Request;
}

/** Performs an impact-confirmed action on one reusable database login. */
export async function action({ params, request }: RouteArgs): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId));
	const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	const databaseUserId = z.uuid().safeParse(params.databaseUserId);
	if (!workspaceId.success || !databaseId.success || !databaseUserId.success) return resp.failure(
		'Database user not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404,
	);
	const input = await parseJson(request, databaseUserActionSchema);
	return input instanceof Response
		? input
		: DatabaseAccessController.userAction(request, workspaceId.data, databaseId.data, databaseUserId.data, input, getRequestMetadata(request));
}
