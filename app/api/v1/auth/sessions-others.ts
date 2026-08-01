import { SessionController } from '@controllers/SessionController';
import { getRequestMetadata } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> {
	return SessionController.revokeOthers(request, getRequestMetadata(request));
}

