import { AuthController } from '@controllers/AuthController';

export async function action({ request }: { request: Request }): Promise<Response> {
	return AuthController.logout(request);
}

