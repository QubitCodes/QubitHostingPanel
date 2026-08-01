import { resp } from '@qubitcodes/qcresp';

import { AdminController } from '@controllers/AdminController';
import { adminIdSchema, deleteAdminSchema, updateAdminSchema } from '@schemas/admin';
import { getRequestMetadata, parseJson } from '@utils/request';

interface Arguments { params: { adminId?: string }; request: Request }

export async function loader({ params, request }: Arguments): Promise<Response> {
	const adminId = adminIdSchema.safeParse(params.adminId);
	return adminId.success ? AdminController.show(request, adminId.data, getRequestMetadata(request)) : resp.failure('Invalid administrator ID.', resp.codes.VALIDATION_ERROR, adminId.error.issues, null, undefined, 400);
}

export async function action({ params, request }: Arguments): Promise<Response> {
	const adminId = adminIdSchema.safeParse(params.adminId);
	if (!adminId.success) return resp.failure('Invalid administrator ID.', resp.codes.VALIDATION_ERROR, adminId.error.issues, null, undefined, 400);
	const metadata = getRequestMetadata(request);
	if (request.method === 'PATCH') {
		const input = await parseJson(request, updateAdminSchema);
		return input instanceof Response ? input : AdminController.update(request, adminId.data, input, metadata);
	}
	if (request.method === 'DELETE') {
		const input = await parseJson(request, deleteAdminSchema);
		return input instanceof Response ? input : AdminController.remove(request, adminId.data, input.reason, metadata);
	}
	return resp.failure('Method not allowed.', resp.codes.GENERAL_CLIENT_ERROR, undefined, null, undefined, 405);
}

