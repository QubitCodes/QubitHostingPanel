import { resp } from '@qubitcodes/qcresp';
import { LogicalDatabaseController } from '@controllers/LogicalDatabaseController';
import { logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';
import { rotateDatabaseCredentialSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { databaseId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); const databaseId = logicalDatabasePublicIdSchema.safeParse(params.databaseId); if (!workspaceId.success || !databaseId.success) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, rotateDatabaseCredentialSchema); return input instanceof Response ? input : LogicalDatabaseController.rotate(request, workspaceId.data, databaseId.data, input, getRequestMetadata(request)); }
