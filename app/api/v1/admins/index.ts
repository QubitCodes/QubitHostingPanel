import { AdminController } from '@controllers/AdminController';
import { createAdminSchema } from '@schemas/admin';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function loader({ request }: { request: Request }): Promise<Response> {
	return AdminController.index(request, getRequestMetadata(request));
}

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, createAdminSchema);
	return input instanceof Response ? input : AdminController.create(request, input, getRequestMetadata(request));
}

