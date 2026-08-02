import { z } from 'zod';

export const offerSlugSchema = z.string().trim().min(2).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const offerFields = z.object({
	name: z.string().trim().min(2).max(160), slug: offerSlugSchema, description: z.string().trim().max(5000).nullable(), couponCode: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_-]+$/).nullable(),
	discountType: z.enum(['percentage', 'fixed']), percentage: z.number().positive().max(100).nullable(), fixedAmount: z.number().positive().max(10_000_000).nullable(), currency: z.literal('INR'), status: z.enum(['draft', 'active', 'archived']),
	startsAt: z.iso.datetime().nullable(), endsAt: z.iso.datetime().nullable(), customerEligibility: z.enum(['everyone', 'new_customers', 'existing_customers']), subscriptionEvent: z.enum(['new_subscription', 'renewal', 'both']), discountRecurrence: z.enum(['once', 'cycles', 'term']), recurrenceCycles: z.number().int().positive().max(120).nullable(), trialHandling: z.enum(['after_trial', 'immediate', 'exclude_trial']), minimumSubtotal: z.number().positive().max(10_000_000).nullable(), maximumDiscount: z.number().positive().max(10_000_000).nullable(), maxRedemptions: z.number().int().positive().nullable(), maxRedemptionsPerCustomer: z.number().int().positive(), stackable: z.boolean(), priority: z.number().int().min(0).max(10000), packageIds: z.array(z.uuid()).max(100), priceIds: z.array(z.uuid()).max(100), eligibleTerms: z.array(z.object({ billingInterval: z.enum(['month', 'year']), intervalCount: z.number().int().positive().max(12) }).strict()).max(24),
}).strict();
function validateOffer(value: z.infer<typeof offerFields>, context: z.RefinementCtx) {
	if ((value.discountType === 'percentage') !== (value.percentage !== null) || (value.discountType === 'fixed') !== (value.fixedAmount !== null)) context.addIssue({ code: 'custom', message: 'Discount value must match its type.', path: ['discountType'] });
	if (value.startsAt && value.endsAt && value.startsAt >= value.endsAt) context.addIssue({ code: 'custom', message: 'End date must be after start date.', path: ['endsAt'] });
	if ((value.discountRecurrence === 'cycles') !== (value.recurrenceCycles !== null)) context.addIssue({ code: 'custom', message: 'Billing cycles are required only for cycle-based recurrence.', path: ['recurrenceCycles'] });
	if (value.discountType !== 'percentage' && value.maximumDiscount !== null) context.addIssue({ code: 'custom', message: 'Maximum discount applies only to percentage offers.', path: ['maximumDiscount'] });
	if (new Set(value.eligibleTerms.map((term) => `${term.billingInterval}:${term.intervalCount}`)).size !== value.eligibleTerms.length) context.addIssue({ code: 'custom', message: 'Eligible durations must be unique.', path: ['eligibleTerms'] });
}
export const createOfferSchema = offerFields.superRefine(validateOffer);
export const updateOfferSchema = offerFields.superRefine(validateOffer);
export type OfferInput = z.infer<typeof createOfferSchema>;
