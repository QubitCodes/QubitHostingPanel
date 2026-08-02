import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { auditLogs, packageCategories, packages } from '@db/schema';
import type {
	CreatePackageCategoryInput,
	CreatePackageInput,
	UpdatePackageInput,
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
			return resp.success('Package retrieved.', { ...record, auditLogs: audits });
		} catch (error) {
			return controllerFailure(error);
		}
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
					publishedAt: input.status === 'published' ? new Date() : null,
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
