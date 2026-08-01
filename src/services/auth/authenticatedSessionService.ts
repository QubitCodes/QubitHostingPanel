import { and, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@db/client';
import { userSessions } from '@db/schema';
import { verifyAccessToken } from '@services/auth/tokenService';
import type { RequestMetadata } from '@utils/request';

export interface AuthenticatedSession {
	context: 'personal' | 'admin' | 'organisation';
	sessionId: string;
	userId: string;
}

/** Validates that a bearer token still maps to an active server-side session. */
export async function authenticateSession(request: Request, metadata?: RequestMetadata): Promise<AuthenticatedSession> {
	const [scheme, token] = request.headers.get('authorization')?.split(' ') ?? [];
	if (scheme?.toLowerCase() !== 'bearer' || !token) throw new Error('Authentication required.');
	const claims = await verifyAccessToken(token);
	const [session] = await db.select().from(userSessions).where(and(
		eq(userSessions.id, claims.sessionId),
		eq(userSessions.userId, claims.userId),
		eq(userSessions.tokenVersion, claims.tokenVersion),
		isNull(userSessions.revokedAt),
		isNull(userSessions.deletedAt),
		gt(userSessions.expiresAt, new Date())
	)).limit(1);
	if (!session) throw new Error('Session is invalid.');
	const now = new Date();
	if (now.getTime() - session.lastActiveAt.getTime() >= 60_000) {
		await db.update(userSessions).set({
			lastActiveAt: now,
			updatedAt: now,
			ipAddress: metadata?.ipAddress ?? session.ipAddress,
			userAgent: metadata?.userAgent ?? session.userAgent
		}).where(eq(userSessions.id, session.id));
	}
	return { context: claims.context, sessionId: session.id, userId: session.userId };
}

