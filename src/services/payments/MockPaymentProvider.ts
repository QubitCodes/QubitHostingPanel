import { createHash } from 'node:crypto';

import type { CreatePaymentInput, PaymentProvider, PaymentSession, VerifiedPayment } from '@services/payments/PaymentProvider';

/** Development-only deterministic payment adapter. It is refused outside development. */
export class MockPaymentProvider implements PaymentProvider {
	public readonly code = 'mock' as const;
	public async createPayment(input: CreatePaymentInput): Promise<PaymentSession> { return Promise.resolve({ type: 'mock', providerOrderId: input.idempotencyKey }); }
	public async verifyCallback(payload: Record<string, string>): Promise<VerifiedPayment> {
		const status = payload.result === 'success' ? 'verified' : payload.result === 'pending' ? 'pending' : payload.result === 'cancelled' ? 'cancelled' : 'failed';
		return Promise.resolve({ amountMinor: Number(payload.amount_minor), currency: payload.currency ?? 'INR', eventKey: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), orderId: payload.order_id ?? '', paymentId: `mock-${Date.now()}`, status, payload });
	}
	public async verifyWebhook(rawBody: string): Promise<VerifiedPayment> { return this.verifyCallback(JSON.parse(rawBody) as Record<string, string>); }
}
