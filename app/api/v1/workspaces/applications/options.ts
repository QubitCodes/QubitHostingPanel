import { ApplicationController } from '@controllers/ApplicationController';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';
import { resp } from '@qubitcodes/qcresp';
export async function loader({ params, request }: { params: { workspaceId?: string }; request: Request }): Promise<Response> { const id = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); return id.success ? ApplicationController.options(request, id.data, getRequestMetadata(request)) : resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
