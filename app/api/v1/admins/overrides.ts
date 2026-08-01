import { resp } from '@qubitcodes/qcresp';

import { AdminController } from '@controllers/AdminController';
import { adminIdSchema, replaceAdminOverridesSchema } from '@schemas/admin';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { adminId?: string }; request: Request }): Promise<Response> {
	const adminId = adminIdSchema.safeParse(params.adminId);
	if (!adminId.success) return resp.failure('Invalid administrator ID.', resp.codes.VALIDATION_ERROR, adminId.error.issues, null, undefined, 400);
	const input = await parseJson(request, replaceAdminOverridesSchema);
	return input instanceof Response ? input : AdminController.replaceOverrides(request, adminId.data, input, getRequestMetadata(request));
}

