import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { customerCheckouts, customers, paymentAttempts, paymentWebhookEvents, users } from '@db/schema';
import type { InitiatePaymentInput } from '@schemas/checkout';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import type { PaymentProviderCode, VerifiedPayment } from '@services/payments/PaymentProvider';
import { availablePaymentProviders, paymentProvider } from '@services/payments/paymentProviderFactory';
import type { RequestMetadata } from '@utils/request';

const sanitizedPayload = (payload: Record<string, unknown>) => Object.fromEntries(Object.entries(payload).filter(([key]) => !['hash', 'razorpay_signature', 'card', 'salt'].includes(key.toLowerCase())));

/** Owns payment initiation and provider result reconciliation. */
export class PaymentController {
	public static async providers(): Promise<Response> { return resp.success('Payment providers retrieved.', availablePaymentProviders()); }

	public static async initiate(request: Request, checkoutPublicId: number, input: InitiatePaymentInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const [checkout] = await db.select({ id: customerCheckouts.id, publicId: customerCheckouts.publicId, status: customerCheckouts.status, amountMinor: customerCheckouts.totalMinor, currency: customerCheckouts.currency, packageName: customerCheckouts.packageNameSnapshot, countryCode: users.countryCode, mobile: users.mobile }).from(customerCheckouts).innerJoin(customers, eq(customers.id, customerCheckouts.customerId)).innerJoin(users, eq(users.id, customers.userId)).where(and(eq(customerCheckouts.publicId, checkoutPublicId), eq(users.id, authenticated.userId), isNull(customerCheckouts.deletedAt), isNull(customers.deletedAt))).limit(1);
			if (!checkout || !['awaiting_payment', 'payment_failed', 'payment_pending'].includes(checkout.status)) return resp.failure('Checkout is not available for payment.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
			const [previous] = await db.select({ id: paymentAttempts.id }).from(paymentAttempts).where(and(eq(paymentAttempts.checkoutId, checkout.id), isNull(paymentAttempts.deletedAt))).orderBy(desc(paymentAttempts.createdAt)).limit(1);
			const idempotencyKey = `checkout:${checkout.publicId}:${input.provider}:${previous ? Date.now() : 1}`;
			const session = await paymentProvider(input.provider).createPayment({ amountMinor: checkout.amountMinor, checkoutPublicId: checkout.publicId, currency: checkout.currency, customerEmail: input.customerEmail, customerMobile: `${checkout.countryCode}${checkout.mobile}`.replace(/[^0-9]/g, ''), customerName: input.customerName, description: checkout.packageName, idempotencyKey });
			await db.transaction(async (transaction) => {
				await transaction.insert(paymentAttempts).values({ checkoutId: checkout.id, provider: input.provider, status: 'pending', idempotencyKey, providerOrderId: session.providerOrderId, amountMinor: checkout.amountMinor, currency: checkout.currency, customerName: input.customerName, customerEmail: input.customerEmail, providerPayload: { sessionType: session.type } });
				await transaction.update(customerCheckouts).set({ status: 'payment_pending', updatedAt: new Date() }).where(eq(customerCheckouts.id, checkout.id));
			});
			return resp.success('Payment session created.', { checkoutId: checkout.publicId, provider: input.provider, session }, resp.codes.CREATED, undefined, 201);
		} catch (error) { console.error('Payment initiation failed.', error); return resp.failure(error instanceof Error ? error.message : 'Unable to initiate payment.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}

	public static async callback(providerCode: PaymentProviderCode, payload: Record<string, string>): Promise<Response> {
		try {
			const verified = await paymentProvider(providerCode).verifyCallback(payload);
			const result = await this.applyProviderResult(providerCode, verified);
			if (providerCode === 'payu') return Response.redirect(new URL(result.success ? `/checkout/${result.checkoutPublicId}/setup` : `/checkout/${result.checkoutPublicId}/failed`, process.env.APP_URL ?? 'http://localhost:5173'), 303);
			return result.success ? resp.success('Payment verified.', { nextUrl: `/checkout/${result.checkoutPublicId}/setup` }) : resp.failure('Payment was not completed.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, { nextUrl: `/checkout/${result.checkoutPublicId}/failed` }, undefined, 422);
		} catch (error) { console.error('Payment callback rejected.', error); return resp.failure('Payment verification failed.', resp.codes.AUTHORIZATION_ERROR, undefined, null, undefined, 400); }
	}

	public static async webhook(providerCode: PaymentProviderCode, request: Request): Promise<Response> {
		try {
			const rawBody = await request.text();
			const verified = await paymentProvider(providerCode).verifyWebhook(rawBody, request.headers);
			await this.applyProviderResult(providerCode, verified);
			return resp.success('Webhook accepted.');
		} catch (error) { console.error('Payment webhook rejected.', error); return resp.failure('Webhook verification failed.', resp.codes.AUTHORIZATION_ERROR, undefined, null, undefined, 400); }
	}

	private static async applyProviderResult(providerCode: PaymentProviderCode, result: VerifiedPayment): Promise<{ checkoutPublicId: number; success: boolean }> {
		const [attempt] = await db.select({ id: paymentAttempts.id, checkoutId: paymentAttempts.checkoutId, amountMinor: paymentAttempts.amountMinor, currency: paymentAttempts.currency, checkoutPublicId: customerCheckouts.publicId }).from(paymentAttempts).innerJoin(customerCheckouts, eq(customerCheckouts.id, paymentAttempts.checkoutId)).where(and(eq(paymentAttempts.provider, providerCode), eq(paymentAttempts.providerOrderId, result.orderId), isNull(paymentAttempts.deletedAt), isNull(customerCheckouts.deletedAt))).orderBy(desc(paymentAttempts.createdAt)).limit(1);
		if (!attempt) throw new Error('Payment attempt not found.');
		const amountMatches = attempt.amountMinor === result.amountMinor && attempt.currency === result.currency;
		const accepted = result.status === 'verified' && amountMatches;
		await db.transaction(async (transaction) => {
			const [inserted] = await transaction.insert(paymentWebhookEvents).values({ paymentAttemptId: attempt.id, provider: providerCode, eventKey: result.eventKey || createHash('sha256').update(JSON.stringify(result.payload)).digest('hex'), eventType: result.status, status: amountMatches ? 'processed' : 'rejected', payload: sanitizedPayload(result.payload), rejectionReason: amountMatches ? null : 'Payment amount or currency mismatch.', processedAt: new Date() }).onConflictDoNothing().returning({ id: paymentWebhookEvents.id });
			if (!inserted) return;
			await transaction.update(paymentAttempts).set({ status: accepted ? 'verified' : result.status, providerPaymentId: result.paymentId, providerPayload: sanitizedPayload(result.payload), verifiedAt: accepted ? new Date() : null, failureMessage: amountMatches ? null : 'Payment amount or currency mismatch.', updatedAt: new Date() }).where(and(eq(paymentAttempts.id, attempt.id), ne(paymentAttempts.status, 'verified')));
			await transaction.update(customerCheckouts).set({ status: accepted ? 'workspace_setup_pending' : result.status === 'failed' ? 'payment_failed' : 'payment_pending', purchasedAt: accepted ? new Date() : null, updatedAt: new Date() }).where(and(eq(customerCheckouts.id, attempt.checkoutId), ne(customerCheckouts.status, 'workspace_setup_pending'), ne(customerCheckouts.status, 'provisioning'), ne(customerCheckouts.status, 'active')));
		});
		return { checkoutPublicId: attempt.checkoutPublicId, success: accepted };
	}
}
