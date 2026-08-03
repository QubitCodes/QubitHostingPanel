import { createHmac, timingSafeEqual } from 'node:crypto';

import { getEnvironment } from '@config/env';
import type { CreatePaymentInput, PaymentProvider, PaymentSession, VerifiedPayment } from '@services/payments/PaymentProvider';

const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');
const safeEqual = (left: string, right: string) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); };

/** Razorpay Standard Checkout adapter with server-side order and signature verification. */
export class RazorpayPaymentProvider implements PaymentProvider {
	public readonly code = 'razorpay' as const;

	public async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
		const environment = getEnvironment();
		if (!environment.RAZORPAY_KEY_ID || !environment.RAZORPAY_KEY_SECRET) throw new Error('Razorpay credentials are unavailable.');
		const response = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${environment.RAZORPAY_KEY_ID}:${environment.RAZORPAY_KEY_SECRET}`).toString('base64')}`, 'content-type': 'application/json' }, body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, receipt: input.idempotencyKey.slice(0, 40), notes: { checkout_public_id: String(input.checkoutPublicId) } }) });
		const body = await response.json() as { id?: string; error?: { description?: string } };
		if (!response.ok || !body.id) throw new Error(body.error?.description ?? 'Unable to create Razorpay order.');
		return { type: 'browser_sdk', providerOrderId: body.id, publicKey: environment.RAZORPAY_KEY_ID };
	}

	public async verifyCallback(payload: Record<string, string>): Promise<VerifiedPayment> {
		const environment = getEnvironment();
		if (!environment.RAZORPAY_KEY_SECRET || !payload.razorpay_signature || !safeEqual(hmac(environment.RAZORPAY_KEY_SECRET, `${payload.razorpay_order_id}|${payload.razorpay_payment_id}`), payload.razorpay_signature)) throw new Error('Invalid Razorpay payment signature.');
		if (!environment.RAZORPAY_KEY_ID) throw new Error('Razorpay credentials are unavailable.');
		const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(payload.razorpay_payment_id)}`, { headers: { authorization: `Basic ${Buffer.from(`${environment.RAZORPAY_KEY_ID}:${environment.RAZORPAY_KEY_SECRET}`).toString('base64')}` }, signal: AbortSignal.timeout(15_000) });
		const payment = await response.json() as { amount?: number; currency?: string; order_id?: string; status?: string };
		if (!response.ok || payment.order_id !== payload.razorpay_order_id) throw new Error('Razorpay payment verification failed.');
		return { amountMinor: Number(payment.amount ?? 0), currency: payment.currency ?? 'INR', eventKey: hmac(environment.RAZORPAY_KEY_SECRET, `${payload.razorpay_order_id}|${payload.razorpay_payment_id}`), orderId: payload.razorpay_order_id, paymentId: payload.razorpay_payment_id, status: payment.status === 'captured' ? 'verified' : payment.status === 'failed' ? 'failed' : 'pending', payload: { ...payload, provider_status: payment.status } };
	}

	public async verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPayment> {
		const environment = getEnvironment();
		const signature = headers.get('x-razorpay-signature') ?? '';
		if (!environment.RAZORPAY_WEBHOOK_SECRET || !safeEqual(hmac(environment.RAZORPAY_WEBHOOK_SECRET, rawBody), signature)) throw new Error('Invalid Razorpay webhook signature.');
		const event = JSON.parse(rawBody) as { event?: string; event_id?: string; payload?: { order?: { entity?: Record<string, unknown> }; payment?: { entity?: Record<string, unknown> } } };
		const payment = event.payload?.payment?.entity ?? {};
		const order = event.payload?.order?.entity ?? {};
		return { amountMinor: Number(payment.amount ?? order.amount_paid ?? 0), currency: String(payment.currency ?? order.currency ?? 'INR'), eventKey: String(event.event_id ?? hmac(environment.RAZORPAY_WEBHOOK_SECRET, rawBody)), orderId: String(payment.order_id ?? order.id ?? ''), paymentId: payment.id ? String(payment.id) : undefined, status: event.event === 'payment.captured' || event.event === 'order.paid' ? 'verified' : event.event === 'payment.failed' ? 'failed' : 'pending', payload: event as Record<string, unknown> };
	}
}
