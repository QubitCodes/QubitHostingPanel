import { resp } from '@qubitcodes/qcresp';
import { LogicalDatabaseController } from '@controllers/LogicalDatabaseController';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId); return workspaceId.success && databaseId.success ? LogicalDatabaseController.rotate(request, workspaceId.data, databaseId.data, getRequestMetadata(request)) : resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
