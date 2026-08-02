import { resp } from '@qubitcodes/qcresp';

import { CheckoutController } from '@controllers/CheckoutController';
import { configureCheckoutWorkspaceSchema } from '@schemas/checkout';
import { workspacePublicIdSchema } from '@schemas/workspace';
import { parseJson, getRequestMetadata } from '@utils/request';

export async function loader({ params, request }: { params: { checkoutId?: string }; request: Request }): Promise<Response> {
	const parsed = workspacePublicIdSchema.safeParse(Number(params.checkoutId));
	return parsed.success ? CheckoutController.show(request, parsed.data, getRequestMetadata(request)) : resp.failure('Checkout not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
}

export async function action({ params, request }: { params: { checkoutId?: string }; request: Request }): Promise<Response> {
	const publicId = workspacePublicIdSchema.safeParse(Number(params.checkoutId));
	if (!publicId.success) return resp.failure('Checkout not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
	const input = await parseJson(request, configureCheckoutWorkspaceSchema);
	return input instanceof Response ? input : CheckoutController.configure(request, publicId.data, input, getRequestMetadata(request));
}
