import { AuthController } from '@controllers/AuthController';
import { consumeAuthenticationHandoffSchema } from '@schemas/auth';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> { const input = await parseJson(request, consumeAuthenticationHandoffSchema); return input instanceof Response ? input : AuthController.consumeHandoff(request, input, getRequestMetadata(request)); }
