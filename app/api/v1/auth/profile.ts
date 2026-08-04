import { AuthController } from '@controllers/AuthController';
import { getRequestMetadata } from '@utils/request';

export function loader({ request }: { request: Request }): Promise<Response> {
	return AuthController.profile(request, getRequestMetadata(request));
}
