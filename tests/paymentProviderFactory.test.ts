import { afterEach, describe, expect, it } from 'vitest';

import { resetEnvironmentForTests } from '@config/env';
import { availablePaymentProviders, paymentProvider } from '@services/payments/paymentProviderFactory';

const originalEnvironment = { ...process.env };
afterEach(() => { process.env = { ...originalEnvironment }; resetEnvironmentForTests(); });

describe('paymentProviderFactory', () => {
	it('never permits mock payments in production', () => {
		process.env = { ...originalEnvironment, APP_ENV: 'production', DATABASE_URL: 'postgresql://test:test@localhost:5432/test', PAYU_ENABLED: 'false', RAZORPAY_ENABLED: 'false' }; resetEnvironmentForTests();
		expect(availablePaymentProviders()).toEqual([]);
		expect(() => paymentProvider('mock')).toThrow('disabled outside development');
	});
});
