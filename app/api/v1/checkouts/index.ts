import { CheckoutController } from '@controllers/CheckoutController';
import { purchaseCheckoutSchema } from '@schemas/checkout';
import { parseJson, getRequestMetadata } from '@utils/request';

export async function action({ request }: { request: Request }): Promise<Response> {
	const input = await parseJson(request, purchaseCheckoutSchema);
	return input instanceof Response ? input : CheckoutController.purchase(request, input, getRequestMetadata(request));
}
