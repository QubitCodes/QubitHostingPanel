import { PaymentController } from '@controllers/PaymentController';

export async function action({ request }: { request: Request }): Promise<Response> {
	const payload = Object.fromEntries(Array.from((await request.formData()).entries(), ([key, value]) => [key, String(value)]));
	return PaymentController.callback('payu', payload);
}
