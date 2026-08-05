import { AdminCustomerControlController } from '@controllers/AdminCustomerControlController';
import { resp } from '@qubitcodes/qcresp';
import { adminUserPublicIdSchema } from '@schemas/adminCustomerControl';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata } from '@utils/request';

export function loader({ params, request }: { params: { userId?: string; workspaceId?: string }; request: Request }): Promise<Response> { const userId = adminUserPublicIdSchema.safeParse(params.userId); const workspaceId = workspacePublicIdSchema.safeParse(Number(params.workspaceId)); return userId.success && workspaceId.success ? AdminCustomerControlController.workspace(request, userId.data, workspaceId.data, getRequestMetadata(request)) : Promise.resolve(resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404)); }
