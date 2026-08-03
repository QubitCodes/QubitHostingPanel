export type PaymentProviderCode = 'mock' | 'payu' | 'razorpay';

export interface CreatePaymentInput {
	amountMinor: number;
	checkoutPublicId: number;
	currency: string;
	customerEmail: string;
	customerMobile: string;
	customerName: string;
	description: string;
	idempotencyKey: string;
}

export interface PaymentSession {
	action?: string;
	fields?: Record<string, string>;
	providerOrderId: string;
	publicKey?: string;
	type: 'redirect_form' | 'browser_sdk' | 'mock';
}

export interface VerifiedPayment {
	amountMinor: number;
	currency: string;
	eventKey: string;
	orderId: string;
	paymentId?: string;
	status: 'verified' | 'pending' | 'failed' | 'cancelled';
	payload: Record<string, unknown>;
}

/** Provider-neutral contract. Commercial state changes only after a verified result. */
export interface PaymentProvider {
	readonly code: PaymentProviderCode;
	createPayment(input: CreatePaymentInput): Promise<PaymentSession>;
	verifyCallback(payload: Record<string, string>): Promise<VerifiedPayment>;
	verifyWebhook(rawBody: string, headers: Headers): Promise<VerifiedPayment>;
}
