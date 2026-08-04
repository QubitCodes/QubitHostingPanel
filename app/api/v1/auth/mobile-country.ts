import { AuthController } from '@controllers/AuthController';
import { resolveMobileCountrySchema } from '@schemas/auth';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, resolveMobileCountrySchema);
	return input instanceof Response ? input : AuthController.resolveMobileCountry(input, getRequestMetadata(request));
}
