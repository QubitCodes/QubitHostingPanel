import { z } from 'zod';
export const checkoutQuoteSchema = z.object({
	priceId: z.uuid(),
	couponCode: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_-]+$/).nullable().optional(),
}).strict();
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;
