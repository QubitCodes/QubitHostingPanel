import { resp } from '@qubitcodes/qcresp';

import { AdminController } from '@controllers/AdminController';
import { adminIdSchema, replaceAdminRolesSchema } from '@schemas/admin';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { adminId?: string }; request: Request }): Promise<Response> {
	const adminId = adminIdSchema.safeParse(params.adminId);
	if (!adminId.success) return resp.failure('Invalid administrator ID.', resp.codes.VALIDATION_ERROR, adminId.error.issues, null, undefined, 400);
	const input = await parseJson(request, replaceAdminRolesSchema);
	return input instanceof Response ? input : AdminController.replaceRoles(request, adminId.data, input.roleIds, getRequestMetadata(request));
}

