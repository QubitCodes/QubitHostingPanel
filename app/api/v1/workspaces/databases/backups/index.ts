import { DatabaseBackupController } from '@controllers/DatabaseBackupController';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';
import { resp } from '@qubitcodes/qcresp';

function identifiers(params: { databaseId?: string; workspaceId?: string }) { return { workspaceId: workspacePublicIdSchema.safeParse(Number(params.workspaceId)), databaseId: logicalDatabasePublicIdSchema.safeParse(params.databaseId) }; }
export async function loader({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const ids = identifiers(params); return ids.workspaceId.success && ids.databaseId.success ? DatabaseBackupController.index(request, ids.workspaceId.data, ids.databaseId.data, getRequestMetadata(request)) : resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const ids = identifiers(params); return ids.workspaceId.success && ids.databaseId.success ? DatabaseBackupController.create(request, ids.workspaceId.data, ids.databaseId.data, getRequestMetadata(request)) : resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
