import { AdminApplicationControlController } from '@controllers/AdminApplicationControlController';
import { resp } from '@qubitcodes/qcresp';
import { adminApplicationActionSchema, adminUserPublicIdSchema } from '@schemas/adminCustomerControl';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { applicationId?: string; userId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const userId = adminUserPublicIdSchema.safeParse(params.userId); const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); if (!userId.success || !workspaceId.success || !params.applicationId) return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, adminApplicationActionSchema); return input instanceof Response ? input : AdminApplicationControlController.control(request, userId.data, workspaceId.data, params.applicationId, input, getRequestMetadata(request)); }
