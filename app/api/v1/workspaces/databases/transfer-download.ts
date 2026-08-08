import { resp } from '@qubitcodes/qcresp';

import { DatabaseTransferController } from '@controllers/DatabaseTransferController';
import { databaseTransferJobIdSchema } from '@schemas/databaseTransfer';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

export async function loader({ params, request }: { params: { databaseId?: string; jobId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId); const jobId = databaseTransferJobIdSchema.safeParse(params.jobId);
	return workspaceId.success && databaseId.success && jobId.success ? DatabaseTransferController.download(request, workspaceId.data, databaseId.data, jobId.data, getRequestMetadata(request)) : resp.failure('Transfer artifact not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}
