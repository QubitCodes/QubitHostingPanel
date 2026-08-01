import { AuthController } from '@controllers/AuthController';
import { refreshSessionSchema } from '@schemas/auth';
import { parseJson } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, refreshSessionSchema);
	return input instanceof Response ? input : AuthController.refresh(input.refreshToken);
}

