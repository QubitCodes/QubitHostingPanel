import { resp } from '@qubitcodes/qcresp';

import { DatabaseTransferController } from '@controllers/DatabaseTransferController';
import { getEnvironment } from '@config/env';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

/** Stages the file-only first step of the JSON-controlled import workflow. */
export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> {
	const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId);
	if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	if (request.method !== 'POST') return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return resp.failure('Content-Type must be multipart/form-data.', resp.codes.UNSUPPORTED_MEDIA_TYPE, undefined, null, undefined, 415);
	const length = Number(request.headers.get('content-length') ?? 0); if (length > getEnvironment().DATABASE_IMPORT_MAX_MB * 1048576 + 1048576) return resp.failure('Import file is too large.', resp.codes.INVALID_INPUT_DATA, undefined, null, undefined, 413);
	const file = (await request.formData()).get('file'); if (!(file instanceof File)) return resp.failure('Import file is required.', resp.codes.MISSING_REQUIRED_FIELD, undefined, null, undefined, 400);
	return DatabaseTransferController.stage(request, workspaceId.data, databaseId.data, file, getRequestMetadata(request));
}
