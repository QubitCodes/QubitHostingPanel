import { AuthController } from '@controllers/AuthController';
import { verifyOtpSchema } from '@schemas/auth';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, verifyOtpSchema);
	return input instanceof Response ? input : AuthController.verifyOtp(input, getRequestMetadata(request));
}

