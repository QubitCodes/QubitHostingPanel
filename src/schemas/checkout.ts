import { z } from 'zod';
export const checkoutQuoteSchema = z.object({
	priceId: z.uuid(),
	couponCode: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_-]+$/).nullable().optional(),
}).strict();
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;

export const purchaseCheckoutSchema = z.object({ quoteToken: z.string().min(32), startTrial: z.boolean().default(false) }).strict();
export const initiatePaymentSchema = z.object({ provider: z.enum(['mock', 'payu', 'razorpay']), customerName: z.string().trim().min(2).max(160), customerEmail: z.email().max(320) }).strict();
export const razorpayCallbackSchema = z.object({ razorpay_order_id: z.string().min(1), razorpay_payment_id: z.string().min(1), razorpay_signature: z.string().min(1) }).strict();
export const configureCheckoutWorkspaceSchema = z.object({
	name: z.string().trim().min(2).max(160),
	type: z.enum(['personal', 'organisation']),
	organisation: z.object({
		displayName: z.string().trim().min(2).max(160),
		legalName: z.string().trim().min(2).max(200).nullable().optional(),
	}).strict().nullable().optional(),
}).strict().superRefine((value, context) => {
	if (value.type === 'organisation' && !value.organisation) context.addIssue({ code: 'custom', message: 'Organisation details are required.', path: ['organisation'] });
});
export type PurchaseCheckoutInput = z.infer<typeof purchaseCheckoutSchema>;
export type InitiatePaymentInput = z.infer<typeof initiatePaymentSchema>;
export type ConfigureCheckoutWorkspaceInput = z.infer<typeof configureCheckoutWorkspaceSchema>;
