import { AuthController } from '@controllers/AuthController';
import { createAuthenticationHandoffSchema } from '@schemas/auth';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> { const input = await parseJson(request, createAuthenticationHandoffSchema); return input instanceof Response ? input : AuthController.createHandoff(request, input, getRequestMetadata(request)); }
