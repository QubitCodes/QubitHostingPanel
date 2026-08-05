import { AdminCustomerControlController } from '@controllers/AdminCustomerControlController';
import { resp } from '@qubitcodes/qcresp';
import { adminUserPublicIdSchema, adminUserStatusSchema } from '@schemas/adminCustomerControl';
import { getRequestMetadata, parseJson } from '@utils/request';

export function loader({ params, request }: { params: { userId?: string }; request: Request }): Promise<Response> { const id = adminUserPublicIdSchema.safeParse(params.userId); return id.success ? AdminCustomerControlController.show(request, id.data, getRequestMetadata(request)) : Promise.resolve(resp.failure('User not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404)); }
export async function action({ params, request }: { params: { userId?: string }; request: Request }): Promise<Response> { const id = adminUserPublicIdSchema.safeParse(params.userId); if (!id.success) return resp.failure('User not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const input = await parseJson(request, adminUserStatusSchema); return input instanceof Response ? input : AdminCustomerControlController.updateStatus(request, id.data, input, getRequestMetadata(request)); }
