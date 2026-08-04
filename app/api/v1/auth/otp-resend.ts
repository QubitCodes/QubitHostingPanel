import { AuthController } from '@controllers/AuthController';
import { resendOtpSchema } from '@schemas/auth';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, resendOtpSchema);
	return input instanceof Response ? input : AuthController.resendOtp(input, getRequestMetadata(request));
}
