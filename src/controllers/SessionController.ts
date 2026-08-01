import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { userSessions } from '@db/schema';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { recordAuditLog } from '@services/auditLogService';
import type { RequestMetadata } from '@utils/request';

const sessionProjection = {
	id: userSessions.id,
	deviceLabel: userSessions.deviceLabel,
	deviceType: userSessions.deviceType,
	deviceVendor: userSessions.deviceVendor,
	deviceModel: userSessions.deviceModel,
	browserName: userSessions.browserName,
	browserVersion: userSessions.browserVersion,
	osName: userSessions.osName,
	osVersion: userSessions.osVersion,
	ipAddress: userSessions.ipAddress,
	location: userSessions.location,
	city: userSessions.city,
	region: userSessions.region,
	country: userSessions.country,
	countryCode: userSessions.countryCode,
	timezone: userSessions.timezone,
	latitude: userSessions.latitude,
	longitude: userSessions.longitude,
	networkAsn: userSessions.networkAsn,
	networkName: userSessions.networkName,
	clientHints: userSessions.clientHints,
	signedInAt: userSessions.signedInAt,
	lastActiveAt: userSessions.lastActiveAt,
	expiresAt: userSessions.expiresAt,
	revokedAt: userSessions.revokedAt,
	revokeReason: userSessions.revokeReason
};

export class SessionController {
	/** Lists only sessions owned by the authenticated user and marks the requesting session. */
	public static async index(request: Request, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const sessions = await db.select(sessionProjection).from(userSessions).where(and(eq(userSessions.userId, authenticated.userId), isNull(userSessions.deletedAt))).orderBy(desc(userSessions.lastActiveAt)).limit(100);
			return resp.success('Sessions retrieved.', sessions.map((session) => ({ ...session, isCurrent: session.id === authenticated.sessionId, isActive: !session.revokedAt && session.expiresAt > new Date() })));
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}

	/** Returns one owned session without exposing token hashes or internal device identifiers. */
	public static async show(request: Request, sessionId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const [session] = await db.select(sessionProjection).from(userSessions).where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, authenticated.userId), isNull(userSessions.deletedAt))).limit(1);
			if (!session) return resp.failure('Session not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			return resp.success('Session retrieved.', { ...session, isCurrent: session.id === authenticated.sessionId, isActive: !session.revokedAt && session.expiresAt > new Date() });
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}

	/** Applies a private, user-controlled label to one owned device session. */
	public static async updateLabel(request: Request, sessionId: string, label: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const [session] = await db.update(userSessions).set({ deviceLabel: label, updatedAt: new Date() }).where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, authenticated.userId), isNull(userSessions.deletedAt))).returning({ id: userSessions.id, deviceLabel: userSessions.deviceLabel });
			if (!session) return resp.failure('Session not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			await recordAuditLog({ actorUserId: authenticated.userId, action: 'session.label_updated', resourceType: 'user_session', resourceId: session.id, metadata: { label }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Device label updated.', session, resp.codes.UPDATED);
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}

	/** Revokes one owned session, including the current session when explicitly selected. */
	public static async revoke(request: Request, sessionId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const [session] = await db.update(userSessions).set({ revokedAt: new Date(), revokeReason: 'user_session_management', updatedAt: new Date() }).where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, authenticated.userId), isNull(userSessions.revokedAt), isNull(userSessions.deletedAt))).returning({ id: userSessions.id });
			if (!session) return resp.failure('Active session not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			await recordAuditLog({ actorUserId: authenticated.userId, action: 'session.revoked', resourceType: 'user_session', resourceId: session.id, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Session revoked.', { id: session.id, currentSessionRevoked: session.id === authenticated.sessionId });
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}

	/** Revokes every active session owned by the user except the requesting session. */
	public static async revokeOthers(request: Request, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const sessions = await db.update(userSessions).set({ revokedAt: new Date(), revokeReason: 'user_revoked_other_sessions', updatedAt: new Date() }).where(and(eq(userSessions.userId, authenticated.userId), ne(userSessions.id, authenticated.sessionId), isNull(userSessions.revokedAt), isNull(userSessions.deletedAt))).returning({ id: userSessions.id });
			await recordAuditLog({ actorUserId: authenticated.userId, action: 'session.others_revoked', resourceType: 'user_session', resourceId: authenticated.sessionId, metadata: { count: sessions.length }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Other sessions revoked.', { revokedCount: sessions.length });
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}
}

