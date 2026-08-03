import { LogicalDatabaseController } from '@controllers/LogicalDatabaseController';
import { createLogicalDatabaseSchema } from '@schemas/logicalDatabase';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';
import { resp } from '@qubitcodes/qcresp';

export async function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); return workspaceId.success ? LogicalDatabaseController.index(request, workspaceId.data, getRequestMetadata(request)) : resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
export async function action({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!workspaceId.success) return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, createLogicalDatabaseSchema); return input instanceof Response ? input : LogicalDatabaseController.create(request, workspaceId.data, input, getRequestMetadata(request)); }
