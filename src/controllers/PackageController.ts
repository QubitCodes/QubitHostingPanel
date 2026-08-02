import { and, asc, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { auditLogs, emailUsageProducts, packageCategories, packageCostReviews, packageEntitlements, packagePriceAssignments, packagePrices, packages, entitlementDefinitions } from '@db/schema';
import type {
	CreatePackageCategoryInput,
	CreatePackageCostReviewInput,
	CreatePackageInput,
	UpdatePackageInput,
	SetPackagePricesInput,
	SetPackageEntitlementsInput,
} from '@schemas/package';
import { recordAuditLog } from '@services/auditLogService';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import type { RequestMetadata } from '@utils/request';

function permissionDenied(): Response {
	return resp.failure(
		'Permission denied.',
		resp.codes.PERMISSION_DENIED,
		undefined,
		null,
		undefined,
		403,
	);
}

/** Converts known access failures without disguising database/runtime faults as RBAC failures. */
function controllerFailure(error: unknown): Response {
	const message = error instanceof Error ? error.message : '';
	if (
		message === 'Authentication required.' ||
		message === 'Session is invalid.' ||
		message === 'Access token claims are invalid.'
	)
		return resp.failure(
			'Authentication required.',
			resp.codes.AUTHENTICATION_ERROR,
			undefined,
			null,
			undefined,
			401,
		);
	if (message === 'Admin context required.' || message === 'Permission denied.')
		return permissionDenied();
	console.error('Package catalogue operation failed.', error);
	return resp.failure(
		'Unable to complete the package request.',
		resp.codes.DATABASE_ERROR,
		undefined,
		null,
		undefined,
		500,
	);
}

function conflict(message: string): Response {
	return resp.failure(
		message,
		resp.codes.RESOURCE_ALREADY_EXISTS,
		undefined,
		null,
		undefined,
		400,
	);
}

async function categoryExists(categoryId: string | null): Promise<boolean> {
	if (!categoryId) return true;
	const [category] = await db
		.select({ id: packageCategories.id })
		.from(packageCategories)
		.where(
			and(
				eq(packageCategories.id, categoryId),
				eq(packageCategories.isActive, true),
				isNull(packageCategories.deletedAt),
			),
		)
		.limit(1);
	return Boolean(category);
}

async function hasApprovedCostReview(packageId: string): Promise<boolean> {
	const [review] = await db.select({ createdAt: packageCostReviews.createdAt, revenueMinor: packageCostReviews.revenueMinor }).from(packageCostReviews).where(and(eq(packageCostReviews.packageId, packageId), eq(packageCostReviews.status, 'approved'), isNull(packageCostReviews.deletedAt))).orderBy(desc(packageCostReviews.createdAt)).limit(1);
	const [monthlyPrice] = await db.select({ amountMinor: packagePrices.amountMinor, effectiveFrom: packagePrices.effectiveFrom }).from(packagePrices).where(and(eq(packagePrices.packageId, packageId), eq(packagePrices.billingInterval, 'month'), eq(packagePrices.isActive, true), isNull(packagePrices.deletedAt))).orderBy(desc(packagePrices.effectiveFrom)).limit(1);
	return Boolean(review && monthlyPrice && review.revenueMinor === monthlyPrice.amountMinor && review.createdAt >= monthlyPrice.effectiveFrom);
}

/** Commercial catalogue administration with server-owned lifecycle validation. */
export class PackageController {
	public static async index(
		request: Request,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			await authorizeAdmin(request, 'packages.view', metadata);
			const records = await db
				.select({
					id: packages.id,
					name: packages.name,
					slug: packages.slug,
					description: packages.description,
					status: packages.status,
					categoryId: packages.categoryId,
					categoryName: packageCategories.name,
					isFeatured: packages.isFeatured,
					displayOrder: packages.displayOrder,
					trialEnabled: packages.trialEnabled,
					trialDuration: packages.trialDuration,
					trialDurationUnit: packages.trialDurationUnit,
					publishedAt: packages.publishedAt,
					createdAt: packages.createdAt,
					updatedAt: packages.updatedAt,
				})
				.from(packages)
				.leftJoin(
					packageCategories,
					and(
						eq(packageCategories.id, packages.categoryId),
						isNull(packageCategories.deletedAt),
					),
				)
				.where(isNull(packages.deletedAt))
				.orderBy(asc(packages.displayOrder), asc(packages.name));
			return resp.success('Packages retrieved.', records);
		} catch (error) {
			return controllerFailure(error);
		}
	}

	public static async show(
		request: Request,
		slug: string,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			await authorizeAdmin(request, 'packages.view', metadata);
			const [record] = await db
				.select({
					id: packages.id,
					name: packages.name,
					slug: packages.slug,
					description: packages.description,
					status: packages.status,
					categoryId: packages.categoryId,
					categoryName: packageCategories.name,
					isFeatured: packages.isFeatured,
					displayOrder: packages.displayOrder,
					trialEnabled: packages.trialEnabled,
					trialDuration: packages.trialDuration,
					trialDurationUnit: packages.trialDurationUnit,
					publishedAt: packages.publishedAt,
					createdAt: packages.createdAt,
					updatedAt: packages.updatedAt,
				})
				.from(packages)
				.leftJoin(
					packageCategories,
					eq(packageCategories.id, packages.categoryId),
				)
				.where(and(eq(packages.slug, slug), isNull(packages.deletedAt)))
				.limit(1);
			if (!record)
				return resp.failure(
					'Package not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			const audits = await db
				.select()
				.from(auditLogs)
				.where(
					and(
						eq(auditLogs.resourceId, record.id),
						isNull(auditLogs.deletedAt),
					),
				)
				.orderBy(desc(auditLogs.createdAt))
				.limit(50);
			const prices = await db
				.select()
				.from(packagePrices)
				.where(and(eq(packagePrices.packageId, record.id), isNull(packagePrices.deletedAt)))
				.orderBy(desc(packagePrices.effectiveFrom));
			const entitlements = await db.select({ id: packageEntitlements.id, code: entitlementDefinitions.code, name: entitlementDefinitions.name, unit: entitlementDefinitions.unit, enforcementMode: entitlementDefinitions.enforcementMode, numericValue: packageEntitlements.numericValue, booleanValue: packageEntitlements.booleanValue, isUnlimited: packageEntitlements.isUnlimited }).from(packageEntitlements).innerJoin(entitlementDefinitions, eq(entitlementDefinitions.id, packageEntitlements.entitlementId)).where(and(eq(packageEntitlements.packageId, record.id), isNull(packageEntitlements.deletedAt), isNull(entitlementDefinitions.deletedAt))).orderBy(asc(entitlementDefinitions.code));
			const costReviews = await db.select().from(packageCostReviews).where(and(eq(packageCostReviews.packageId, record.id), isNull(packageCostReviews.deletedAt))).orderBy(desc(packageCostReviews.createdAt));
			const emailProducts = await db.select().from(emailUsageProducts).where(and(eq(emailUsageProducts.isActive, true), isNull(emailUsageProducts.deletedAt))).orderBy(asc(emailUsageProducts.includedRecipients));
			return resp.success('Package retrieved.', { ...record, auditLogs: audits, prices, entitlements, costReviews, emailProducts });
		} catch (error) {
			return controllerFailure(error);
		}
	}

	/** Replaces current INR prices while retaining immutable historical versions. */
	public static async setPrices(
		request: Request,
		slug: string,
		input: SetPackagePricesInput,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'packages.update', metadata);
			const [record] = await db
				.select({ id: packages.id, slug: packages.slug })
				.from(packages)
				.where(and(eq(packages.slug, slug), isNull(packages.deletedAt)))
				.limit(1);
			if (!record)
				return resp.failure('Package not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const now = new Date();
			const inserted = await db.transaction(async (transaction) => {
				await transaction
					.update(packagePrices)
					.set({ effectiveUntil: now, isActive: false, updatedAt: now })
					.where(and(eq(packagePrices.packageId, record.id), eq(packagePrices.currency, input.currency), eq(packagePrices.isActive, true), isNull(packagePrices.deletedAt)));
				return transaction
					.insert(packagePrices)
					.values([
						{ packageId: record.id, currency: input.currency, billingInterval: 'month', intervalCount: 1, amountMinor: Math.round(input.monthlyAmount * 100), taxBehavior: input.taxBehavior, isPublic: input.isPublic },
						{ packageId: record.id, currency: input.currency, billingInterval: 'year', intervalCount: 1, amountMinor: Math.round(input.yearlyAmount * 100), taxBehavior: input.taxBehavior, isPublic: input.isPublic },
					])
					.returning();
			});
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'package.prices_updated',
				resourceType: 'package',
				resourceId: record.id,
				metadata: { currency: input.currency, monthlyAmount: input.monthlyAmount, yearlyAmount: input.yearlyAmount, isPublic: input.isPublic },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Package prices updated.', inserted, resp.codes.UPDATED);
		} catch (error) {
			return controllerFailure(error);
		}
	}

	/** Reports active term dependencies before a price is removed from sale. */
	public static async priceDeletionImpact(request: Request, slug: string, priceId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			await authorizeAdmin(request, 'packages.delete', metadata);
			const [price] = await db.select({ id: packagePrices.id }).from(packagePrices).innerJoin(packages, eq(packages.id, packagePrices.packageId)).where(and(eq(packages.slug, slug), eq(packagePrices.id, priceId), isNull(packagePrices.deletedAt), isNull(packages.deletedAt))).limit(1);
			if (!price) return resp.failure('Package price not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const now = new Date();
			const [impact] = await db.select({ activeUsers: count(packagePriceAssignments.id), latestTermEnd: sql<Date | null>`max(${packagePriceAssignments.termEndsAt})` }).from(packagePriceAssignments).where(and(eq(packagePriceAssignments.priceId, priceId), eq(packagePriceAssignments.status, 'active'), gt(packagePriceAssignments.termEndsAt, now), isNull(packagePriceAssignments.deletedAt)));
			return resp.success('Price deletion impact retrieved.', { activeUsers: Number(impact?.activeUsers ?? 0), latestTermEnd: impact?.latestTermEnd ?? null });
		} catch (error) { return controllerFailure(error); }
	}

	/** Soft-deletes a price from sale without altering active customer terms. */
	public static async removePrice(request: Request, slug: string, priceId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'packages.delete', metadata);
			const now = new Date();
			const [ownedPrice] = await db.select({ id: packagePrices.id }).from(packagePrices).innerJoin(packages, eq(packages.id, packagePrices.packageId)).where(and(eq(packagePrices.id, priceId), eq(packages.slug, slug), isNull(packagePrices.deletedAt), isNull(packages.deletedAt))).limit(1);
			if (!ownedPrice) return resp.failure('Package price not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const [price] = await db.update(packagePrices).set({ isActive: false, isPublic: false, effectiveUntil: now, deletedAt: now, deleteReason: 'Removed from package pricing.', updatedAt: now }).where(and(eq(packagePrices.id, priceId), isNull(packagePrices.deletedAt))).returning({ id: packagePrices.id });
			await recordAuditLog({ actorUserId: actor.userId, action: 'package.price_deleted', resourceType: 'package_price', resourceId: price.id, metadata: { packageSlug: slug }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Price removed from future purchases. Existing customer terms are unchanged.');
		} catch (error) { return controllerFailure(error); }
	}

	/** Records a server-calculated AWS cost and margin review used by the publish gate. */
	public static async createCostReview(request: Request, slug: string, input: CreatePackageCostReviewInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'packages.publish', metadata);
			const [record] = await db.select({ id: packages.id }).from(packages).where(and(eq(packages.slug, slug), isNull(packages.deletedAt))).limit(1);
			if (!record) return resp.failure('Package not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const costMinor = Math.round(input.estimatedMonthlyCost * 100);
			const revenueMinor = Math.round(input.revenue * 100);
			const marginBasisPoints = Math.round(((revenueMinor - costMinor) / revenueMinor) * 10_000);
			const [review] = await db.insert(packageCostReviews).values({ packageId: record.id, estimatedMonthlyCostMinor: costMinor, revenueMinor, marginBasisPoints, status: input.status, notes: input.notes, reviewedBy: actor.userId, reviewedAt: new Date() }).returning();
			await recordAuditLog({ actorUserId: actor.userId, action: 'package.cost_review_created', resourceType: 'package_cost_review', resourceId: review.id, metadata: { packageSlug: slug, status: input.status, marginBasisPoints }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Package cost review recorded.', review, resp.codes.CREATED, undefined, 201);
		} catch (error) { return controllerFailure(error); }
	}

	/** Replaces package entitlement values for future subscription snapshots. */
	public static async setEntitlements(request: Request, slug: string, input: SetPackageEntitlementsInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'packages.update', metadata);
			const [record] = await db.select({ id: packages.id }).from(packages).where(and(eq(packages.slug, slug), isNull(packages.deletedAt))).limit(1);
			if (!record) return resp.failure('Package not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const definitions = await db.select({ id: entitlementDefinitions.id, valueType: entitlementDefinitions.valueType }).from(entitlementDefinitions).where(isNull(entitlementDefinitions.deletedAt));
			const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));
			for (const item of input.items) {
				const definition = definitionMap.get(item.entitlementId);
				if (!definition || (!item.isUnlimited && definition.valueType === 'number' && item.numericValue === null) || (!item.isUnlimited && definition.valueType === 'boolean' && item.booleanValue === null)) return resp.failure('Entitlement value does not match its definition.', resp.codes.INVALID_INPUT_DATA, undefined, null, undefined, 400);
			}
			await db.transaction(async (transaction) => {
				for (const item of input.items) await transaction.insert(packageEntitlements).values({ packageId: record.id, entitlementId: item.entitlementId, numericValue: item.numericValue, booleanValue: item.booleanValue, isUnlimited: item.isUnlimited }).onConflictDoUpdate({ target: [packageEntitlements.packageId, packageEntitlements.entitlementId], targetWhere: sql`${packageEntitlements.deletedAt} IS NULL`, set: { numericValue: item.numericValue, booleanValue: item.booleanValue, isUnlimited: item.isUnlimited, updatedAt: new Date() } });
			});
			await recordAuditLog({ actorUserId: actor.userId, action: 'package.entitlements_updated', resourceType: 'package', resourceId: record.id, metadata: { count: input.items.length }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Package entitlements updated.', undefined, resp.codes.UPDATED);
		} catch (error) { return controllerFailure(error); }
	}

	public static async create(
		request: Request,
		input: CreatePackageInput,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'packages.create', metadata);
			if (!(await categoryExists(input.categoryId)))
				return resp.failure(
					'Package category is invalid.',
					resp.codes.INVALID_INPUT_DATA,
					undefined,
					null,
					undefined,
					400,
				);
			if (
				input.status !== 'draft' &&
				!actor.isSuperAdmin &&
				!actor.permissionCodes.has('packages.publish')
			)
				return permissionDenied();
			if (input.status === 'published')
				return resp.failure('Create the package as a draft and approve its AWS cost and margin review before publishing.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
			const [existing] = await db
				.select({ id: packages.id })
				.from(packages)
				.where(and(eq(packages.slug, input.slug), isNull(packages.deletedAt)))
				.limit(1);
			if (existing) return conflict('A package with this slug already exists.');
			const [record] = await db
				.insert(packages)
				.values({
					...input,
					publishedAt: null,
				})
				.returning();
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'package.created',
				resourceType: 'package',
				resourceId: record.id,
				metadata: { slug: record.slug, status: record.status },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success(
				'Package created.',
				record,
				resp.codes.CREATED,
				undefined,
				201,
			);
		} catch (error) {
			return controllerFailure(error);
		}
	}

	public static async update(
		request: Request,
		slug: string,
		input: UpdatePackageInput,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'packages.update', metadata);
			if (input.categoryId !== undefined && !(await categoryExists(input.categoryId)))
				return resp.failure(
					'Package category is invalid.',
					resp.codes.INVALID_INPUT_DATA,
					undefined,
					null,
					undefined,
					400,
				);
			if (
				input.status &&
				input.status !== 'draft' &&
				!actor.isSuperAdmin &&
				!actor.permissionCodes.has('packages.publish')
			)
				return permissionDenied();
			if (input.slug && input.slug !== slug) {
				const [existing] = await db
					.select({ id: packages.id })
					.from(packages)
					.where(and(eq(packages.slug, input.slug), isNull(packages.deletedAt)))
					.limit(1);
				if (existing) return conflict('A package with this slug already exists.');
			}
			if (input.status === 'published') {
				const [current] = await db.select({ id: packages.id }).from(packages).where(and(eq(packages.slug, slug), isNull(packages.deletedAt))).limit(1);
				if (!current || !(await hasApprovedCostReview(current.id))) return resp.failure('An approved AWS cost and margin review is required before publishing.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
			}
			const [record] = await db
				.update(packages)
				.set({
					...input,
					...(input.status === 'published' ? { publishedAt: new Date() } : {}),
					updatedAt: new Date(),
				})
				.where(and(eq(packages.slug, slug), isNull(packages.deletedAt)))
				.returning();
			if (!record)
				return resp.failure(
					'Package not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'package.updated',
				resourceType: 'package',
				resourceId: record.id,
				metadata: input,
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Package updated.', record, resp.codes.UPDATED);
		} catch (error) {
			return controllerFailure(error);
		}
	}

	public static async remove(
		request: Request,
		slug: string,
		reason: string,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'packages.delete', metadata);
			const now = new Date();
			const [record] = await db
				.update(packages)
				.set({ deletedAt: now, deleteReason: reason, updatedAt: now })
				.where(and(eq(packages.slug, slug), isNull(packages.deletedAt)))
				.returning({ id: packages.id, slug: packages.slug });
			if (!record)
				return resp.failure(
					'Package not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'package.deleted',
				resourceType: 'package',
				resourceId: record.id,
				reason,
				metadata: { slug: record.slug },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Package deleted.');
		} catch (error) {
			return controllerFailure(error);
		}
	}

	public static async categories(
		request: Request,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(
				request,
				'package_categories.view',
				metadata,
			);
			const records = await db
				.select()
				.from(packageCategories)
				.where(
					and(
						eq(packageCategories.isActive, true),
						isNull(packageCategories.deletedAt),
					),
				)
				.orderBy(
					asc(packageCategories.displayOrder),
					asc(packageCategories.name),
				);
			return resp.success('Package categories retrieved.', {
				canCreate:
					actor.isSuperAdmin ||
					actor.permissionCodes.has('package_categories.create'),
				items: records,
			});
		} catch (error) {
			return controllerFailure(error);
		}
	}

	public static async createCategory(
		request: Request,
		input: CreatePackageCategoryInput,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(
				request,
				'package_categories.create',
				metadata,
			);
			const [existing] = await db
				.select({ id: packageCategories.id })
				.from(packageCategories)
				.where(
					and(
						eq(packageCategories.slug, input.slug),
						isNull(packageCategories.deletedAt),
					),
				)
				.limit(1);
			if (existing) return conflict('A category with this slug already exists.');
			const [record] = await db
				.insert(packageCategories)
				.values(input)
				.returning();
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'package_category.created',
				resourceType: 'package_category',
				resourceId: record.id,
				metadata: { slug: record.slug },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success(
				'Package category created.',
				record,
				resp.codes.CREATED,
				undefined,
				201,
			);
		} catch (error) {
			return controllerFailure(error);
		}
	}
}
