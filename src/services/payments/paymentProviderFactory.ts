import { getEnvironment } from '@config/env';
import { MockPaymentProvider } from '@services/payments/MockPaymentProvider';
import type { PaymentProvider, PaymentProviderCode } from '@services/payments/PaymentProvider';
import { PayUPaymentProvider } from '@services/payments/PayUPaymentProvider';
import { RazorpayPaymentProvider } from '@services/payments/RazorpayPaymentProvider';

/** Resolves only explicitly enabled providers and prevents mock payments outside development. */
export function paymentProvider(provider: PaymentProviderCode): PaymentProvider {
	const environment = getEnvironment();
	if (provider === 'mock') {
		if (environment.APP_ENV !== 'development') throw new Error('Mock payments are disabled outside development.');
		return new MockPaymentProvider();
	}
	if (provider === 'payu') {
		if (environment.PAYU_ENABLED !== 'true') throw new Error('PayU is disabled.');
		return new PayUPaymentProvider();
	}
	if (environment.RAZORPAY_ENABLED !== 'true') throw new Error('Razorpay is disabled.');
	return new RazorpayPaymentProvider();
}

export function availablePaymentProviders(): PaymentProviderCode[] {
	const environment = getEnvironment();
	return [
		...(environment.APP_ENV === 'development' ? ['mock' as const] : []),
		...(environment.PAYU_ENABLED === 'true' ? ['payu' as const] : []),
		...(environment.RAZORPAY_ENABLED === 'true' ? ['razorpay' as const] : []),
	];
}
