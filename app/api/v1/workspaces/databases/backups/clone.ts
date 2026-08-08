import { DatabaseBackupController } from '@controllers/DatabaseBackupController';
import { cloneDatabaseBackupSchema, databaseBackupPublicIdSchema } from '@schemas/databaseBackup';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';
import { resp } from '@qubitcodes/qcresp';

export async function action({ params, request }: { params: { backupId?: string; databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId); const backupId = databaseBackupPublicIdSchema.safeParse(params.backupId); if (!workspaceId.success || !databaseId.success || !backupId.success) return resp.failure('Backup not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, cloneDatabaseBackupSchema); return input instanceof Response ? input : DatabaseBackupController.clone(request, workspaceId.data, databaseId.data, backupId.data, input, getRequestMetadata(request)); }
