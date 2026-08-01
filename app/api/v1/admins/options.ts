import { AdminController } from '@controllers/AdminController';
import { getRequestMetadata } from '@utils/request';

export async function loader({ request }: { request: Request }): Promise<Response> {
	return AdminController.options(request, getRequestMetadata(request));
}

