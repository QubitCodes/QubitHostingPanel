import { resp } from '@qubitcodes/qcresp';

import { DatabaseTransferController } from '@controllers/DatabaseTransferController';
import { databaseTransferJobActionSchema, databaseTransferJobIdSchema } from '@schemas/databaseTransfer';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { databaseId?: string; jobId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId); const jobId = databaseTransferJobIdSchema.safeParse(params.jobId);
	if (!workspaceId.success || !databaseId.success || !jobId.success) return resp.failure('Transfer job not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (request.method !== 'PATCH') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const input = await parseJson(request, databaseTransferJobActionSchema);
	return input instanceof Response ? input : DatabaseTransferController.action(request, workspaceId.data, databaseId.data, jobId.data, input.action, getRequestMetadata(request));
}
