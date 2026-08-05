import { AdminCustomerControlController } from '@controllers/AdminCustomerControlController';
import { resp } from '@qubitcodes/qcresp';
import { adminSessionRevokeSchema, adminUserPublicIdSchema } from '@schemas/adminCustomerControl';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { sessionId?: string; userId?: string }; request: Request }): Promise<Response> { const userId = adminUserPublicIdSchema.safeParse(params.userId); if (!userId.success || !params.sessionId) return resp.failure('Session not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, adminSessionRevokeSchema); return input instanceof Response ? input : AdminCustomerControlController.revokeSession(request, userId.data, params.sessionId, input.reason, getRequestMetadata(request)); }
