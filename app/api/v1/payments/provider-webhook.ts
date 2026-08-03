import { resp } from '@qubitcodes/qcresp';

import { PaymentController } from '@controllers/PaymentController';

export async function action({ params, request }: { params: { provider?: string }; request: Request }): Promise<Response> {
	if (params.provider !== 'payu' && params.provider !== 'razorpay') return resp.failure('Resource not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	return PaymentController.webhook(params.provider, request);
}
