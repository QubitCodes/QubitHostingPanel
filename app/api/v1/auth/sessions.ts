import { SessionController } from '@controllers/SessionController';
import { getRequestMetadata } from '@utils/request';

export async function loader({ request }: { request: Request }): Promise<Response> {
	return SessionController.index(request, getRequestMetadata(request));
}

