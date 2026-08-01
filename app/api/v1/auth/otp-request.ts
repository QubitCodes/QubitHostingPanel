import { AuthController } from '@controllers/AuthController';
import { requestOtpSchema } from '@schemas/auth';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, requestOtpSchema);
	return input instanceof Response ? input : AuthController.requestOtp(input, getRequestMetadata(request));
}

