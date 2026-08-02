import { z } from 'zod';

const slugSchema = z
	.string()
	.trim()
	.min(2)
	.max(160)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const trialFields = {
	trialDuration: z.number().int().positive().max(365).nullable(),
	trialDurationUnit: z.enum(['day', 'week', 'month']).nullable(),
	trialEnabled: z.boolean(),
};

function validateTrial(
	value: {
		trialDuration?: number | null;
		trialDurationUnit?: 'day' | 'month' | 'week' | null;
		trialEnabled?: boolean;
	},
	context: z.RefinementCtx,
): void {
	if (
		value.trialEnabled !== undefined &&
		(value.trialEnabled
			? value.trialDuration == null || value.trialDurationUnit == null
			: value.trialDuration !== null || value.trialDurationUnit !== null)
	)
		context.addIssue({
			code: 'custom',
			message: 'Trial duration and unit must match the enabled state.',
			path: ['trialDuration'],
		});
}

export const packageSlugSchema = slugSchema;
export const createPackageCategorySchema = z
	.object({
		description: z.string().trim().max(500).nullable().optional(),
		displayOrder: z.number().int().min(0).max(10000).default(0),
		name: z.string().trim().min(2).max(120),
		slug: slugSchema.max(120),
	})
	.strict();

const packageFields = z.object({
	categoryId: z.uuid().nullable(),
	description: z.string().trim().max(5000).nullable(),
	displayOrder: z.number().int().min(0).max(10000),
	isFeatured: z.boolean(),
	name: z.string().trim().min(2).max(160),
	slug: slugSchema,
	status: z.enum(['draft', 'published', 'archived']),
});

const packageInputSchema = packageFields.extend(trialFields).strict();

export const createPackageSchema = packageInputSchema.superRefine(validateTrial);

export const updatePackageSchema = packageInputSchema.partial().superRefine(
	(value, context) => {
		if (Object.keys(value).length === 0)
			context.addIssue({
				code: 'custom',
				message: 'Provide at least one package change.',
			});
		const trialFields = [
			value.trialEnabled,
			value.trialDuration,
			value.trialDurationUnit,
		];
		if (
			trialFields.some((field) => field !== undefined) &&
			trialFields.some((field) => field === undefined)
		)
			context.addIssue({
				code: 'custom',
				message: 'Submit all trial configuration fields together.',
				path: ['trialEnabled'],
			});
		validateTrial(value, context);
	});

export const deletePackageSchema = z
	.object({ reason: z.string().trim().min(3).max(500) })
	.strict();

export const setPackagePricesSchema = z.object({
	currency: z.literal('INR').default('INR'),
	isPublic: z.boolean().default(false),
	monthlyAmount: z.number().positive().max(10_000_000).multipleOf(0.01),
	twoYearAmount: z.number().positive().max(30_000_000).multipleOf(0.01),
	threeYearAmount: z.number().positive().max(30_000_000).multipleOf(0.01),
	taxBehavior: z.enum(['exclusive', 'inclusive']).default('exclusive'),
	yearlyAmount: z.number().positive().max(10_000_000).multipleOf(0.01),
}).strict();

export const createPackageCostReviewSchema = z.object({
	estimatedMonthlyCost: z.number().nonnegative().max(10_000_000).multipleOf(0.01),
	revenue: z.number().positive().max(10_000_000).multipleOf(0.01),
	status: z.enum(['approved', 'pending', 'rejected']),
	notes: z.string().trim().min(10).max(5000),
}).strict();

export const setPackageEntitlementsSchema = z.object({
	items: z.array(z.object({
		entitlementId: z.uuid(),
		numericValue: z.number().int().nonnegative().nullable(),
		booleanValue: z.boolean().nullable(),
		isUnlimited: z.boolean(),
	}).strict()).max(100),
}).strict().superRefine((value, context) => {
	for (const [index, item] of value.items.entries()) {
		const count = Number(item.numericValue !== null) + Number(item.booleanValue !== null);
		if ((item.isUnlimited && count !== 0) || (!item.isUnlimited && count !== 1)) context.addIssue({ code: 'custom', message: 'Choose one value or unlimited.', path: ['items', index] });
	}
});

export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
export type CreatePackageCategoryInput = z.infer<
	typeof createPackageCategorySchema
>;
export type SetPackagePricesInput = z.infer<typeof setPackagePricesSchema>;
export type CreatePackageCostReviewInput = z.infer<typeof createPackageCostReviewSchema>;
export type SetPackageEntitlementsInput = z.infer<typeof setPackageEntitlementsSchema>;
