import { z } from 'zod';

export const subscriptionLifecycleSchema = z.object({ status: z.enum(['trialing', 'active', 'cancelled', 'expired']), reason: z.string().trim().min(2).max(500).optional() }).strict();
export const subscriptionAddOnSchema = z.object({ code: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/), name: z.string().trim().min(2).max(160), quantity: z.number().int().positive().max(100000), unitAmountMinor: z.number().int().nonnegative(), currency: z.string().trim().toUpperCase().length(3), entitlementSnapshot: z.array(z.record(z.string(), z.unknown())).default([]) }).strict();
export const subscriptionAddOnCancellationSchema = z.object({ reason: z.string().trim().min(2).max(500) }).strict();
