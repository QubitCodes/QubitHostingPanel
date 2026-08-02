import { and, eq, gt, isNull, or } from 'drizzle-orm';

import { db } from '@db/client';
import {
	platformPermissions,
	platformRoles,
	platformUserPermissionOverrides,
	platformUserRoles,
} from '@db/schema';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { getEffectivePermissionCodes } from '@services/authorization/permissionService';
import type { RequestMetadata } from '@utils/request';

export interface AuthorizedAdmin {
	isSuperAdmin: boolean;
	permissionCodes: Set<string>;
	sessionId: string;
	userId: string;
}

/** Requires an active admin-context session and one effective platform permission. */
export async function authorizeAdmin(
	request: Request,
	permissionCode: string,
	metadata: RequestMetadata,
): Promise<AuthorizedAdmin> {
	const authenticated = await authenticateSession(request, metadata);
	if (authenticated.context !== 'admin')
		throw new Error('Admin context required.');
	const [superAssignment] = await db
		.select({ id: platformUserRoles.id })
		.from(platformUserRoles)
		.innerJoin(platformRoles, eq(platformRoles.id, platformUserRoles.roleId))
		.where(
			and(
				eq(platformUserRoles.userId, authenticated.userId),
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
	if (superAssignment) {
		return {
			isSuperAdmin: true,
			permissionCodes: new Set(),
			sessionId: authenticated.sessionId,
			userId: authenticated.userId,
		};
	}
	const permissionCodes = await getEffectivePermissionCodes(
		authenticated.userId,
	);
	const [explicitDeny] = await db
		.select({ id: platformUserPermissionOverrides.id })
		.from(platformUserPermissionOverrides)
		.innerJoin(
			platformPermissions,
			eq(platformPermissions.id, platformUserPermissionOverrides.permissionId),
		)
		.where(
			and(
				eq(platformUserPermissionOverrides.userId, authenticated.userId),
				eq(platformUserPermissionOverrides.effect, 'deny'),
				eq(platformPermissions.code, permissionCode),
				isNull(platformUserPermissionOverrides.deletedAt),
				isNull(platformPermissions.deletedAt),
				or(
					isNull(platformUserPermissionOverrides.expiresAt),
					gt(platformUserPermissionOverrides.expiresAt, new Date()),
				),
			),
		)
		.limit(1);
	if (explicitDeny || !permissionCodes.has(permissionCode))
		throw new Error('Permission denied.');
	return {
		isSuperAdmin: false,
		permissionCodes,
		sessionId: authenticated.sessionId,
		userId: authenticated.userId,
	};
}
