import {
	and,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	notExists,
	or,
	sql,
} from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import {
	auditLogs,
	authenticationEvents,
	platformPermissions,
	platformRolePermissions,
	platformRoles,
	platformUserPermissionOverrides,
	platformUserRoles,
	userSessions,
	users,
} from '@db/schema';
import type {
	CreateAdminInput,
	ReplaceAdminOverridesInput,
	UpdateAdminInput,
} from '@schemas/admin';
import {
	authorizeAdmin,
	type AuthorizedAdmin,
} from '@services/authorization/adminAuthorizationService';
import { recordAuditLog } from '@services/auditLogService';
import type { RequestMetadata } from '@utils/request';

async function targetIsSuperAdmin(userId: string): Promise<boolean> {
	const [assignment] = await db
		.select({ id: platformUserRoles.id })
		.from(platformUserRoles)
		.innerJoin(platformRoles, eq(platformRoles.id, platformUserRoles.roleId))
		.where(
			and(
				eq(platformUserRoles.userId, userId),
				eq(platformRoles.isSuperAdmin, true),
				isNull(platformUserRoles.deletedAt),
				isNull(platformRoles.deletedAt),
				or(
					isNull(platformUserRoles.expiresAt),
					gt(platformUserRoles.expiresAt, new Date()),
				),
			),
		)
		.limit(1);
	return Boolean(assignment);
}

async function ensureVisibleTarget(
	actor: AuthorizedAdmin,
	userId: string,
): Promise<boolean> {
	return actor.isSuperAdmin || !(await targetIsSuperAdmin(userId));
}

async function assertAssignableRoles(
	actor: AuthorizedAdmin,
	roleIds: string[],
): Promise<void> {
	const roles = await db
		.select()
		.from(platformRoles)
		.where(
			and(inArray(platformRoles.id, roleIds), isNull(platformRoles.deletedAt)),
		);
	if (roles.length !== new Set(roleIds).size)
		throw new Error('One or more roles are invalid.');
	if (!actor.isSuperAdmin && roles.some((role) => role.isSuperAdmin))
		throw new Error('Super Admin role cannot be assigned.');
	if (!actor.isSuperAdmin) {
		const grants = await db
			.select({ code: platformPermissions.code })
			.from(platformRolePermissions)
			.innerJoin(
				platformPermissions,
				eq(platformPermissions.id, platformRolePermissions.permissionId),
			)
			.where(
				and(
					inArray(platformRolePermissions.roleId, roleIds),
					isNull(platformRolePermissions.deletedAt),
					isNull(platformPermissions.deletedAt),
				),
			);
		if (grants.some(({ code }) => !actor.permissionCodes.has(code)))
			throw new Error(
				'A role cannot grant permissions the assigning user does not hold.',
			);
	}
}

async function countActiveSuperAdmins(): Promise<number> {
	const [result] = await db
		.select({ value: count() })
		.from(platformUserRoles)
		.innerJoin(platformRoles, eq(platformRoles.id, platformUserRoles.roleId))
		.innerJoin(users, eq(users.id, platformUserRoles.userId))
		.where(
			and(
				eq(platformRoles.isSuperAdmin, true),
				eq(users.status, 'active'),
				isNull(users.deletedAt),
				isNull(platformUserRoles.deletedAt),
				isNull(platformRoles.deletedAt),
				or(
					isNull(platformUserRoles.expiresAt),
					gt(platformUserRoles.expiresAt, new Date()),
				),
			),
		);
	return result?.value ?? 0;
}

function authorizationFailure(): Response {
	return resp.failure(
		'Permission denied.',
		resp.codes.PERMISSION_DENIED,
		undefined,
		null,
		undefined,
		403,
	);
}

async function resolveUserId(publicId: number): Promise<string | undefined> {
	const [user] = await db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.publicId, publicId), isNull(users.deletedAt)))
		.limit(1);
	return user?.id;
}

export class AdminController {
	/** Lists platform administrators while hiding Super Admin identities at query level when required. */
	public static async index(
		request: Request,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'admins.view', metadata);
			const hiddenSuperAdmin = db
				.select({ userId: platformUserRoles.userId })
				.from(platformUserRoles)
				.innerJoin(
					platformRoles,
					eq(platformRoles.id, platformUserRoles.roleId),
				)
				.where(
					and(
						eq(platformUserRoles.userId, users.id),
						eq(platformRoles.isSuperAdmin, true),
						isNull(platformUserRoles.deletedAt),
						isNull(platformRoles.deletedAt),
						or(
							isNull(platformUserRoles.expiresAt),
							gt(platformUserRoles.expiresAt, new Date()),
						),
					),
				);
			const visibility = actor.isSuperAdmin
				? sql`true`
				: notExists(hiddenSuperAdmin);
			const records = await db
				.selectDistinct({
					id: users.id,
					publicId: users.publicId,
					displayName: users.displayName,
					countryCode: users.countryCode,
					mobile: users.mobile,
					status: users.status,
					mobileVerifiedAt: users.mobileVerifiedAt,
					createdAt: users.createdAt,
				})
				.from(users)
				.innerJoin(platformUserRoles, eq(platformUserRoles.userId, users.id))
				.innerJoin(
					platformRoles,
					eq(platformRoles.id, platformUserRoles.roleId),
				)
				.where(
					and(
						isNull(users.deletedAt),
						isNull(platformUserRoles.deletedAt),
						isNull(platformRoles.deletedAt),
						or(
							isNull(platformUserRoles.expiresAt),
							gt(platformUserRoles.expiresAt, new Date()),
						),
						visibility,
					),
				)
				.orderBy(desc(users.createdAt))
				.limit(100);
			const admins = records.map((admin) => ({
				...admin,
				mobileE164: `${admin.countryCode}${admin.mobile}`,
				roles: [] as Array<{ id: string; name: string }>,
				hasPermissionOverrides: false,
			}));
			if (admins.length) {
				const userIds = admins.map(({ id }) => id);
				const [roleAssignments, overrideAssignments] = await Promise.all([
					db
						.select({
							userId: platformUserRoles.userId,
							id: platformRoles.id,
							name: platformRoles.name,
						})
						.from(platformUserRoles)
						.innerJoin(
							platformRoles,
							eq(platformRoles.id, platformUserRoles.roleId),
						)
						.where(
							and(
								inArray(platformUserRoles.userId, userIds),
								isNull(platformUserRoles.deletedAt),
								isNull(platformRoles.deletedAt),
								or(
									isNull(platformUserRoles.expiresAt),
									gt(platformUserRoles.expiresAt, new Date()),
								),
							),
						),
					db
						.selectDistinct({ userId: platformUserPermissionOverrides.userId })
						.from(platformUserPermissionOverrides)
						.where(
							and(
								inArray(platformUserPermissionOverrides.userId, userIds),
								isNull(platformUserPermissionOverrides.deletedAt),
								or(
									isNull(platformUserPermissionOverrides.expiresAt),
									gt(platformUserPermissionOverrides.expiresAt, new Date()),
								),
							),
						),
				]);
				const overriddenUsers = new Set(
					overrideAssignments.map(({ userId }) => userId),
				);
				for (const admin of admins) {
					admin.roles = roleAssignments
						.filter(({ userId }) => userId === admin.id)
						.map(({ id, name }) => ({ id, name }));
					admin.hasPermissionOverrides = overriddenUsers.has(admin.id);
				}
			}
			return resp.success('Administrators retrieved.', admins);
		} catch {
			return authorizationFailure();
		}
	}

	/** Returns an administrator with roles, overrides, sessions, events, and audit history. */
	public static async show(
		request: Request,
		publicId: number,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'admins.view', metadata);
			const userId = await resolveUserId(publicId);
			if (!userId)
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (!(await ensureVisibleTarget(actor, userId)))
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			const [adminRecord] = await db
				.select({
					id: users.id,
					publicId: users.publicId,
					displayName: users.displayName,
					countryCode: users.countryCode,
					mobile: users.mobile,
					status: users.status,
					mobileVerifiedAt: users.mobileVerifiedAt,
					createdAt: users.createdAt,
				})
				.from(users)
				.innerJoin(platformUserRoles, eq(platformUserRoles.userId, users.id))
				.where(
					and(
						eq(users.id, userId),
						isNull(users.deletedAt),
						isNull(platformUserRoles.deletedAt),
						or(
							isNull(platformUserRoles.expiresAt),
							gt(platformUserRoles.expiresAt, new Date()),
						),
					),
				)
				.limit(1);
			const admin = adminRecord
				? {
						...adminRecord,
						mobileE164: `${adminRecord.countryCode}${adminRecord.mobile}`,
					}
				: undefined;
			if (!admin)
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			const [roles, overrides, sessions, events, audits] = await Promise.all([
				db
					.select({
						id: platformRoles.id,
						code: platformRoles.code,
						name: platformRoles.name,
						expiresAt: platformUserRoles.expiresAt,
					})
					.from(platformUserRoles)
					.innerJoin(
						platformRoles,
						eq(platformRoles.id, platformUserRoles.roleId),
					)
					.where(
						and(
							eq(platformUserRoles.userId, userId),
							isNull(platformUserRoles.deletedAt),
							isNull(platformRoles.deletedAt),
						),
					),
				db
					.select({
						id: platformUserPermissionOverrides.id,
						effect: platformUserPermissionOverrides.effect,
						reason: platformUserPermissionOverrides.reason,
						expiresAt: platformUserPermissionOverrides.expiresAt,
						permissionId: platformPermissions.id,
						permissionCode: platformPermissions.code,
						permissionName: platformPermissions.name,
					})
					.from(platformUserPermissionOverrides)
					.innerJoin(
						platformPermissions,
						eq(
							platformPermissions.id,
							platformUserPermissionOverrides.permissionId,
						),
					)
					.where(
						and(
							eq(platformUserPermissionOverrides.userId, userId),
							isNull(platformUserPermissionOverrides.deletedAt),
							isNull(platformPermissions.deletedAt),
						),
					),
				db
					.select({
						id: userSessions.id,
						deviceLabel: userSessions.deviceLabel,
						browserName: userSessions.browserName,
						osName: userSessions.osName,
						ipAddress: userSessions.ipAddress,
						location: userSessions.location,
						signedInAt: userSessions.signedInAt,
						lastActiveAt: userSessions.lastActiveAt,
						revokedAt: userSessions.revokedAt,
						expiresAt: userSessions.expiresAt,
					})
					.from(userSessions)
					.where(
						and(
							eq(userSessions.userId, userId),
							isNull(userSessions.deletedAt),
						),
					)
					.orderBy(desc(userSessions.lastActiveAt))
					.limit(25),
				db
					.select()
					.from(authenticationEvents)
					.where(
						and(
							eq(authenticationEvents.userId, userId),
							isNull(authenticationEvents.deletedAt),
						),
					)
					.orderBy(desc(authenticationEvents.createdAt))
					.limit(25),
				db
					.select()
					.from(auditLogs)
					.where(
						and(
							or(
								eq(auditLogs.actorUserId, userId),
								eq(auditLogs.resourceId, userId),
							),
							isNull(auditLogs.deletedAt),
						),
					)
					.orderBy(desc(auditLogs.createdAt))
					.limit(25),
			]);
			return resp.success('Administrator retrieved.', {
				...admin,
				roles,
				overrides,
				sessions,
				authenticationEvents: events,
				auditLogs: audits,
			});
		} catch {
			return authorizationFailure();
		}
	}

	/** Creates one passwordless identity and assigns reviewed platform roles. */
	public static async create(
		request: Request,
		input: CreateAdminInput,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'admins.create', metadata);
			await assertAssignableRoles(actor, input.roleIds);
			const countryCode = `+${input.countryCode.replace(/\D/g, '')}`;
			const mobileE164 = `${countryCode}${input.mobile}`;
			const [existing] = await db
				.select({ id: users.id })
				.from(users)
				.where(
					and(
						eq(users.countryCode, countryCode),
						eq(users.mobile, input.mobile),
						isNull(users.deletedAt),
					),
				)
				.limit(1);
			if (existing)
				return resp.failure(
					'An identity already uses this mobile number.',
					resp.codes.RESOURCE_ALREADY_EXISTS,
					undefined,
					null,
					undefined,
					400,
				);
			const [record] = await db
				.insert(users)
				.values({
					mobile: input.mobile,
					countryCode,
					displayName: input.displayName,
				})
				.returning({
					id: users.id,
					publicId: users.publicId,
					displayName: users.displayName,
					countryCode: users.countryCode,
					mobile: users.mobile,
					status: users.status,
				});
			const admin = record ? { ...record, mobileE164 } : undefined;
			if (!admin) throw new Error('Unable to create administrator.');
			await db.insert(platformUserRoles).values(
				input.roleIds.map((roleId) => ({
					userId: admin.id,
					roleId,
					assignedByUserId: actor.userId,
				})),
			);
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'admin.created',
				resourceType: 'user',
				resourceId: admin.id,
				metadata: { roleIds: input.roleIds },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success(
				'Administrator created.',
				admin,
				resp.codes.CREATED,
				undefined,
				201,
			);
		} catch (error) {
			return error instanceof Error && error.message.includes('role')
				? resp.failure(
						error.message,
						resp.codes.PERMISSION_DENIED,
						undefined,
						null,
						undefined,
						403,
					)
				: authorizationFailure();
		}
	}

	/** Updates safe profile/status fields and protects the final active Super Admin. */
	public static async update(
		request: Request,
		publicId: number,
		input: UpdateAdminInput,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'admins.update', metadata);
			const userId = await resolveUserId(publicId);
			if (!userId)
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (!(await ensureVisibleTarget(actor, userId)))
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (
				input.status &&
				input.status !== 'active' &&
				(await targetIsSuperAdmin(userId)) &&
				(await countActiveSuperAdmins()) <= 1
			)
				return resp.failure(
					'The final active Super Admin cannot be deactivated.',
					resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
					undefined,
					null,
					undefined,
					422,
				);
			const [admin] = await db
				.update(users)
				.set({ ...input, updatedAt: new Date() })
				.where(and(eq(users.id, userId), isNull(users.deletedAt)))
				.returning({
					id: users.id,
					publicId: users.publicId,
					displayName: users.displayName,
					status: users.status,
				});
			if (!admin)
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (input.status && input.status !== 'active')
				await db
					.update(userSessions)
					.set({
						revokedAt: new Date(),
						revokeReason: `admin_${input.status}`,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(userSessions.userId, userId),
							isNull(userSessions.revokedAt),
						),
					);
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'admin.updated',
				resourceType: 'user',
				resourceId: userId,
				metadata: input,
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Administrator updated.', admin, resp.codes.UPDATED);
		} catch {
			return authorizationFailure();
		}
	}

	/** Soft-deletes one visible administrator and revokes all active sessions. */
	public static async remove(
		request: Request,
		publicId: number,
		reason: string,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'admins.delete', metadata);
			const userId = await resolveUserId(publicId);
			if (!userId)
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (!(await ensureVisibleTarget(actor, userId)))
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (
				(await targetIsSuperAdmin(userId)) &&
				(await countActiveSuperAdmins()) <= 1
			)
				return resp.failure(
					'The final active Super Admin cannot be deleted.',
					resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
					undefined,
					null,
					undefined,
					422,
				);
			const now = new Date();
			const [admin] = await db
				.update(users)
				.set({ deletedAt: now, deleteReason: reason, updatedAt: now })
				.where(and(eq(users.id, userId), isNull(users.deletedAt)))
				.returning({ id: users.id });
			if (!admin)
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			await Promise.all([
				db
					.update(platformUserRoles)
					.set({ deletedAt: now, deleteReason: reason, updatedAt: now })
					.where(
						and(
							eq(platformUserRoles.userId, userId),
							isNull(platformUserRoles.deletedAt),
						),
					),
				db
					.update(platformUserPermissionOverrides)
					.set({ deletedAt: now, deleteReason: reason, updatedAt: now })
					.where(
						and(
							eq(platformUserPermissionOverrides.userId, userId),
							isNull(platformUserPermissionOverrides.deletedAt),
						),
					),
				db
					.update(userSessions)
					.set({
						revokedAt: now,
						revokeReason: 'admin_deleted',
						updatedAt: now,
					})
					.where(
						and(
							eq(userSessions.userId, userId),
							isNull(userSessions.revokedAt),
						),
					),
			]);
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'admin.deleted',
				resourceType: 'user',
				resourceId: userId,
				reason,
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Administrator deleted.');
		} catch {
			return authorizationFailure();
		}
	}

	/** Replaces active role assignments while preventing hidden-role escalation. */
	public static async replaceRoles(
		request: Request,
		publicId: number,
		roleIds: string[],
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'roles.update', metadata);
			const userId = await resolveUserId(publicId);
			if (!userId)
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (!(await ensureVisibleTarget(actor, userId)))
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			await assertAssignableRoles(actor, roleIds);
			if (
				(await targetIsSuperAdmin(userId)) &&
				!(
					await db
						.select({ id: platformRoles.id })
						.from(platformRoles)
						.where(
							and(
								inArray(platformRoles.id, roleIds),
								eq(platformRoles.isSuperAdmin, true),
								isNull(platformRoles.deletedAt),
							),
						)
						.limit(1)
				).length &&
				(await countActiveSuperAdmins()) <= 1
			)
				return resp.failure(
					'The final Super Admin role cannot be removed.',
					resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
					undefined,
					null,
					undefined,
					422,
				);
			const now = new Date();
			await db
				.update(platformUserRoles)
				.set({
					deletedAt: now,
					deleteReason: 'role_assignment_replaced',
					updatedAt: now,
				})
				.where(
					and(
						eq(platformUserRoles.userId, userId),
						isNull(platformUserRoles.deletedAt),
					),
				);
			await db.insert(platformUserRoles).values(
				roleIds.map((roleId) => ({
					userId,
					roleId,
					assignedByUserId: actor.userId,
				})),
			);
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'admin.roles_replaced',
				resourceType: 'user',
				resourceId: userId,
				metadata: { roleIds },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success(
				'Administrator roles updated.',
				{ roleIds },
				resp.codes.UPDATED,
			);
		} catch (error) {
			return error instanceof Error && error.message.includes('role')
				? resp.failure(
						error.message,
						resp.codes.PERMISSION_DENIED,
						undefined,
						null,
						undefined,
						403,
					)
				: authorizationFailure();
		}
	}

	/** Replaces explicit permission overrides; denies remain dominant during resolution. */
	public static async replaceOverrides(
		request: Request,
		publicId: number,
		input: ReplaceAdminOverridesInput,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'roles.update', metadata);
			const userId = await resolveUserId(publicId);
			if (!userId)
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (!(await ensureVisibleTarget(actor, userId)))
				return resp.failure(
					'Administrator not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (await targetIsSuperAdmin(userId))
				return resp.failure(
					'Super Admin permissions are always enabled and cannot be overridden.',
					resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
					undefined,
					null,
					undefined,
					422,
				);
			const permissionIds = input.overrides.map(
				({ permissionId }) => permissionId,
			);
			const permissions = permissionIds.length
				? await db
						.select({
							id: platformPermissions.id,
							code: platformPermissions.code,
						})
						.from(platformPermissions)
						.where(
							and(
								inArray(platformPermissions.id, permissionIds),
								isNull(platformPermissions.deletedAt),
							),
						)
				: [];
			if (
				permissions.length !== new Set(permissionIds).size ||
				(!actor.isSuperAdmin &&
					permissions.some(({ code }) => !actor.permissionCodes.has(code)))
			)
				return authorizationFailure();
			const now = new Date();
			await db
				.update(platformUserPermissionOverrides)
				.set({
					deletedAt: now,
					deleteReason: 'permission_overrides_replaced',
					updatedAt: now,
				})
				.where(
					and(
						eq(platformUserPermissionOverrides.userId, userId),
						isNull(platformUserPermissionOverrides.deletedAt),
					),
				);
			if (input.overrides.length)
				await db.insert(platformUserPermissionOverrides).values(
					input.overrides.map((override) => ({
						userId,
						permissionId: override.permissionId,
						effect: override.effect,
						reason: override.reason,
						expiresAt: override.expiresAt ? new Date(override.expiresAt) : null,
						assignedByUserId: actor.userId,
					})),
				);
			await recordAuditLog({
				actorUserId: actor.userId,
				action: 'admin.permission_overrides_replaced',
				resourceType: 'user',
				resourceId: userId,
				metadata: { count: input.overrides.length },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success(
				'Permission overrides updated.',
				{ count: input.overrides.length },
				resp.codes.UPDATED,
			);
		} catch {
			return authorizationFailure();
		}
	}

	/** Returns assignable roles and permissions, hiding the Super Admin role when necessary. */
	public static async options(
		request: Request,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const actor = await authorizeAdmin(request, 'roles.view', metadata);
			const roleRecords = await db
				.select({
					id: platformRoles.id,
					code: platformRoles.code,
					name: platformRoles.name,
					description: platformRoles.description,
				})
				.from(platformRoles)
				.where(
					and(
						isNull(platformRoles.deletedAt),
						actor.isSuperAdmin
							? sql`true`
							: eq(platformRoles.isSuperAdmin, false),
					),
				)
				.orderBy(platformRoles.name);
			const rolePermissions = roleRecords.length
				? await db
						.select({
							roleId: platformRolePermissions.roleId,
							permissionId: platformRolePermissions.permissionId,
						})
						.from(platformRolePermissions)
						.innerJoin(
							platformPermissions,
							eq(platformPermissions.id, platformRolePermissions.permissionId),
						)
						.where(
							and(
								inArray(
									platformRolePermissions.roleId,
									roleRecords.map(({ id }) => id),
								),
								isNull(platformRolePermissions.deletedAt),
								isNull(platformPermissions.deletedAt),
							),
						)
				: [];
			const roles = roleRecords.map((role) => ({
				...role,
				permissionIds: rolePermissions
					.filter(({ roleId }) => roleId === role.id)
					.map(({ permissionId }) => permissionId),
			}));
			const permissions = await db
				.select({
					id: platformPermissions.id,
					code: platformPermissions.code,
					name: platformPermissions.name,
				})
				.from(platformPermissions)
				.where(
					and(
						isNull(platformPermissions.deletedAt),
						actor.isSuperAdmin
							? sql`true`
							: inArray(platformPermissions.code, [...actor.permissionCodes]),
					),
				)
				.orderBy(platformPermissions.code);
			return resp.success('Admin options retrieved.', { roles, permissions });
		} catch {
			return authorizationFailure();
		}
	}
}
