import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetEnvironmentForTests } from '@config/env';
import { PayUPaymentProvider } from '@services/payments/PayUPaymentProvider';

const originalEnvironment = { ...process.env };
const sha512 = (value: string) => createHash('sha512').update(value).digest('hex');

describe('PayUPaymentProvider', () => {
	beforeEach(() => {
		process.env = { ...originalEnvironment, APP_URL: 'https://panel.example.test', DATABASE_URL: 'postgresql://test:test@localhost:5432/test', PAYU_ENABLED: 'true', PAYU_ENVIRONMENT: 'test', PAYU_MERCHANT_KEY: 'merchant-key', PAYU_MERCHANT_SALT: 'merchant-salt' };
		resetEnvironmentForTests();
	});
	afterEach(() => { process.env = { ...originalEnvironment }; resetEnvironmentForTests(); });

	it('creates a test hosted-checkout form without exposing the salt', async () => {
		const session = await new PayUPaymentProvider().createPayment({ amountMinor: 11782, checkoutPublicId: 123456, currency: 'INR', customerEmail: 'buyer@example.test', customerMobile: '919876543210', customerName: 'Test Buyer', description: 'Launch', idempotencyKey: 'checkout:123456:payu:1' });
		expect(session.action).toBe('https://test.payu.in/_payment');
		expect(session.fields).toMatchObject({ amount: '117.82', key: 'merchant-key', udf1: '123456' });
		expect(JSON.stringify(session)).not.toContain('merchant-salt');
	});

	it('accepts a valid reverse hash and rejects tampering', async () => {
		const payload = { status: 'success', unmappedstatus: 'captured', udf1: '123456', udf2: '', udf3: '', udf4: '', udf5: '', email: 'buyer@example.test', firstname: 'Test Buyer', productinfo: 'Launch', amount: '117.82', txnid: 'checkout-123456-payu-1', mihpayid: '403993715530' };
		const hash = sha512(['merchant-salt', payload.status, '', '', '', '', '', payload.udf5, payload.udf4, payload.udf3, payload.udf2, payload.udf1, payload.email, payload.firstname, payload.productinfo, payload.amount, payload.txnid, 'merchant-key'].join('|'));
		await expect(new PayUPaymentProvider().verifyCallback({ ...payload, hash })).resolves.toMatchObject({ amountMinor: 11782, status: 'verified' });
		await expect(new PayUPaymentProvider().verifyCallback({ ...payload, amount: '1.00', hash })).rejects.toThrow('Invalid PayU response hash');
	});
});
