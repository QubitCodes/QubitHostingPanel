import { AuthController } from '@controllers/AuthController';
import { switchContextSchema } from '@schemas/auth';
import { parseJson } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, switchContextSchema);
	return input instanceof Response ? input : AuthController.switchContext(request, input.context);
}

