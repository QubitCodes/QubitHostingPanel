import { resp } from '@qubitcodes/qcresp';

import { DatabaseTransferController } from '@controllers/DatabaseTransferController';
import { databaseTransferExportRequestSchema } from '@schemas/databaseTransfer';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function loader({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	return workspaceId.success && databaseId.success ? DatabaseTransferController.jobs(request, workspaceId.data, databaseId.data, getRequestMetadata(request)) : resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}

export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (request.method !== 'POST') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	const input = await parseJson(request, databaseTransferExportRequestSchema);
	return input instanceof Response ? input : DatabaseTransferController.queueExport(request, workspaceId.data, databaseId.data, input, getRequestMetadata(request));
}
