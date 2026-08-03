import { ApplicationController } from '@controllers/ApplicationController';
import { createApplicationSchema } from '@schemas/application';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';
import { resp } from '@qubitcodes/qcresp';
export async function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const id = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); return id.success ? ApplicationController.index(request, id.data, getRequestMetadata(request)) : resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
export async function action({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const id = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!id.success) return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, createApplicationSchema); return input instanceof Response ? input : ApplicationController.create(request, id.data, input, getRequestMetadata(request)); }
