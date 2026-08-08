import { DatabaseBackupController } from '@controllers/DatabaseBackupController';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { databaseBackupScheduleSchema } from '@schemas/databaseBackup';
import { getRequestMetadata, parseJson } from '@utils/request';
import { resp } from '@qubitcodes/qcresp';

function ids(params: { databaseId?: string; workspaceId?: string }) { return { databaseId: logicalDatabasePublicIdSchema.safeParse(params.databaseId), workspaceId: workspacePublicIdSchema.safeParse(Number(params.workspaceId)) }; }
export function loader({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const parsed = ids(params); return parsed.databaseId.success && parsed.workspaceId.success ? DatabaseBackupController.schedule(request, parsed.workspaceId.data, parsed.databaseId.data, undefined, getRequestMetadata(request)) : Promise.resolve(resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404)); }
export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const parsed = ids(params); if (!parsed.databaseId.success || !parsed.workspaceId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); if (request.method === 'DELETE') return DatabaseBackupController.removeSchedule(request, parsed.workspaceId.data, parsed.databaseId.data, getRequestMetadata(request)); const input = await parseJson(request, databaseBackupScheduleSchema); return input instanceof Response ? input : DatabaseBackupController.schedule(request, parsed.workspaceId.data, parsed.databaseId.data, input, getRequestMetadata(request)); }
