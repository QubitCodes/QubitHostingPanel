import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';

import { db } from '@db/client';
import { platformPermissions, platformRolePermissions, platformUserPermissionOverrides, platformUserRoles } from '@db/schema';

/** Resolves role grants plus user allows, then applies user denies last. */
export async function getEffectivePermissionCodes(userId: string): Promise<Set<string>> {
	const now = new Date();
	const assignments = await db.select({ roleId: platformUserRoles.roleId }).from(platformUserRoles).where(and(
		eq(platformUserRoles.userId, userId),
		isNull(platformUserRoles.deletedAt),
		or(isNull(platformUserRoles.expiresAt), gt(platformUserRoles.expiresAt, now))
	));
	const granted = new Set<string>();
	if (assignments.length) {
		const roleGrants = await db.select({ code: platformPermissions.code }).from(platformRolePermissions)
			.innerJoin(platformPermissions, eq(platformPermissions.id, platformRolePermissions.permissionId))
			.where(and(inArray(platformRolePermissions.roleId, assignments.map(({ roleId }) => roleId)), isNull(platformRolePermissions.deletedAt), isNull(platformPermissions.deletedAt)));
		for (const permission of roleGrants) granted.add(permission.code);
	}
	const overrides = await db.select({ code: platformPermissions.code, effect: platformUserPermissionOverrides.effect })
		.from(platformUserPermissionOverrides)
		.innerJoin(platformPermissions, eq(platformPermissions.id, platformUserPermissionOverrides.permissionId))
		.where(and(eq(platformUserPermissionOverrides.userId, userId), isNull(platformUserPermissionOverrides.deletedAt), isNull(platformPermissions.deletedAt), or(isNull(platformUserPermissionOverrides.expiresAt), gt(platformUserPermissionOverrides.expiresAt, now))));
	for (const override of overrides) if (override.effect === 'allow') granted.add(override.code);
	for (const override of overrides) if (override.effect === 'deny') granted.delete(override.code);
	return granted;
}

