import { resp } from '@qubitcodes/qcresp';

import { PaymentController } from '@controllers/PaymentController';
import { razorpayCallbackSchema } from '@schemas/checkout';
import { parseJson } from '@utils/request';

export async function action({ params, request }: { params: { provider?: string }; request: Request }): Promise<Response> {
	if (params.provider !== 'razorpay' && params.provider !== 'mock') return resp.failure('Resource not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const schema = params.provider === 'razorpay' ? razorpayCallbackSchema : { safeParse: (value: unknown) => ({ success: true as const, data: value as Record<string, string> }) };
	const input = await parseJson(request, schema as typeof razorpayCallbackSchema);
	return input instanceof Response ? input : PaymentController.callback(params.provider, input);
}
