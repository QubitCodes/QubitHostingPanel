import { DatabaseBackupController } from '@controllers/DatabaseBackupController';
import { databaseBackupPublicIdSchema } from '@schemas/databaseBackup';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';
import { resp } from '@qubitcodes/qcresp';

export async function loader({ params, request }: { params: { backupId?: string; databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId); const backupId = databaseBackupPublicIdSchema.safeParse(params.backupId); return workspaceId.success && databaseId.success && backupId.success ? DatabaseBackupController.download(request, workspaceId.data, databaseId.data, backupId.data, getRequestMetadata(request)) : resp.failure('Backup not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
