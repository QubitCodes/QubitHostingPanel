import { resp } from '@qubitcodes/qcresp';

import { PaymentController } from '@controllers/PaymentController';
import { initiatePaymentSchema } from '@schemas/checkout';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { getRequestMetadata, parseJson } from '@utils/request';

export async function action({ params, request }: { params: { checkoutId?: string }; request: Request }): Promise<Response> {
	const checkoutId = workspacePublicIdSchema.safeParse(Number(params.checkoutId));
	if (!checkoutId.success) return resp.failure('Checkout not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const input = await parseJson(request, initiatePaymentSchema);
	return input instanceof Response ? input : PaymentController.initiate(request, checkoutId.data, input, getRequestMetadata(request));
}
