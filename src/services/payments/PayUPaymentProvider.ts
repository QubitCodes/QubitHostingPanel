import { createHash, timingSafeEqual } from 'node:crypto';

import { getEnvironment } from '@config/env';
import type { CreatePaymentInput, PaymentProvider, PaymentSession, VerifiedPayment } from '@services/payments/PaymentProvider';

const sha512 = (value: string) => createHash('sha512').update(value).digest('hex');
const safeEqual = (left: string, right: string) => {
	const leftBuffer = Buffer.from(left.toLowerCase());
	const rightBuffer = Buffer.from(right.toLowerCase());
	return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

/** PayU Hosted Checkout adapter using server-generated request and reverse-response hashes. */
export class PayUPaymentProvider implements PaymentProvider {
	public readonly code = 'payu' as const;

	public async createPayment(input: CreatePaymentInput): Promise<PaymentSession> {
		const environment = getEnvironment();
		if (!environment.PAYU_MERCHANT_KEY || !environment.PAYU_MERCHANT_SALT) throw new Error('PayU credentials are unavailable.');
		const amount = (input.amountMinor / 100).toFixed(2);
		const txnid = input.idempotencyKey.replaceAll(':', '-').slice(0, 40);
		const productinfo = input.description.slice(0, 100);
		const firstname = input.customerName.slice(0, 60);
		const udf1 = String(input.checkoutPublicId);
		const udf2 = '';
		const udf3 = '';
		const udf4 = '';
		const udf5 = '';
		const hashSequence = [environment.PAYU_MERCHANT_KEY, txnid, amount, productinfo, firstname, input.customerEmail, udf1, udf2, udf3, udf4, udf5, '', '', '', '', '', environment.PAYU_MERCHANT_SALT].join('|');
		const callbackUrl = `${environment.APP_URL.replace(/\/$/, '')}/api/v1/payments/payu/callback`;
		return Promise.resolve({
			type: 'redirect_form', providerOrderId: txnid,
			action: environment.PAYU_ENVIRONMENT === 'production' ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment',
			fields: { key: environment.PAYU_MERCHANT_KEY, txnid, amount, productinfo, firstname, email: input.customerEmail, phone: input.customerMobile, surl: callbackUrl, furl: callbackUrl, hash: sha512(hashSequence), udf1, udf2, udf3, udf4, udf5 },
		});
	}

	public async verifyCallback(payload: Record<string, string>): Promise<VerifiedPayment> {
		const environment = getEnvironment();
		if (!environment.PAYU_MERCHANT_KEY || !environment.PAYU_MERCHANT_SALT) throw new Error('PayU credentials are unavailable.');
		const reverseSequence = [environment.PAYU_MERCHANT_SALT, payload.status ?? '', ...(payload.splitInfo ? [payload.splitInfo] : []), '', '', '', '', '', payload.udf5 ?? '', payload.udf4 ?? '', payload.udf3 ?? '', payload.udf2 ?? '', payload.udf1 ?? '', payload.email ?? '', payload.firstname ?? '', payload.productinfo ?? '', payload.amount ?? '', payload.txnid ?? '', environment.PAYU_MERCHANT_KEY].join('|');
		const expected = sha512(payload.additional_charges ? `${payload.additional_charges}|${reverseSequence}` : reverseSequence);
		if (!payload.hash || !safeEqual(expected, payload.hash)) throw new Error('Invalid PayU response hash.');
		return this.toVerifiedPayment(payload);
	}

	public async verifyWebhook(rawBody: string): Promise<VerifiedPayment> {
		const params = new URLSearchParams(rawBody);
		return this.verifyCallback(Object.fromEntries(params.entries()));
	}

	private toVerifiedPayment(payload: Record<string, string>): VerifiedPayment {
		const mappedStatus = payload.status?.toLowerCase(); const unmappedStatus = payload.unmappedstatus?.toLowerCase();
		const status = mappedStatus === 'success' && (unmappedStatus === 'captured' || unmappedStatus === 'success') ? 'verified' : mappedStatus === 'failure' ? 'failed' : 'pending';
		return { amountMinor: Math.round(Number(payload.amount ?? 0) * 100), currency: 'INR', eventKey: sha512(`${payload.txnid}|${payload.mihpayid}|${payload.status}|${payload.unmappedstatus}`).slice(0, 128), orderId: payload.txnid ?? '', paymentId: payload.mihpayid || undefined, status, payload };
	}
}
