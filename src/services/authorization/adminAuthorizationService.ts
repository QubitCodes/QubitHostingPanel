import { and, eq, gt, isNull, or } from 'drizzle-orm';

import { db } from '@db/client';
import { platformRoles, platformUserRoles } from '@db/schema';
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
export async function authorizeAdmin(request: Request, permissionCode: string, metadata: RequestMetadata): Promise<AuthorizedAdmin> {
	const authenticated = await authenticateSession(request, metadata);
	if (authenticated.context !== 'admin') throw new Error('Admin context required.');
	const permissionCodes = await getEffectivePermissionCodes(authenticated.userId);
	if (!permissionCodes.has(permissionCode)) throw new Error('Permission denied.');
	const [superAssignment] = await db.select({ id: platformUserRoles.id }).from(platformUserRoles)
		.innerJoin(platformRoles, eq(platformRoles.id, platformUserRoles.roleId))
		.where(and(eq(platformUserRoles.userId, authenticated.userId), eq(platformRoles.isSuperAdmin, true), isNull(platformUserRoles.deletedAt), isNull(platformRoles.deletedAt), or(isNull(platformUserRoles.expiresAt), gt(platformUserRoles.expiresAt, new Date())))).limit(1);
	return { isSuperAdmin: Boolean(superAssignment), permissionCodes, sessionId: authenticated.sessionId, userId: authenticated.userId };
}

