import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { authenticationEvents, otpChallenges, platformUserRoles, userSessions, users } from '@db/schema';
import type { RequestOtpInput, VerifyOtpInput } from '@schemas/auth';
import { Msg91OtpProvider, type OtpDeliveryProvider } from '@services/auth/Msg91OtpProvider';
import { createOtpSalt, hashOtp, hashSensitiveValue, verifyOtpHash } from '@services/auth/otpCryptoService';
import { createRefreshToken, hashRefreshToken, issueAccessToken, verifyAccessToken, type SessionContext } from '@services/auth/tokenService';
import type { RequestMetadata } from '@utils/request';

function maskMobile(value: string): string {
	return value.length <= 4 ? '*'.repeat(value.length) : `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

function requireOtpSecret(): string {
	const value = getEnvironment().OTP_HASH_SECRET;
	if (!value || value.length < 32) throw new Error('OTP_HASH_SECRET must contain at least 32 characters.');
	return value;
}

function getBearerToken(request: Request): string | undefined {
	const [scheme, token] = request.headers.get('authorization')?.split(' ') ?? [];
	return scheme?.toLowerCase() === 'bearer' ? token : undefined;
}

async function createSession(userId: string, tokenVersion: number, metadata: RequestMetadata) {
	const environment = getEnvironment();
	const refreshToken = createRefreshToken();
	const expiresAt = new Date(Date.now() + environment.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
	const [session] = await db.insert(userSessions).values({
		userId,
		refreshTokenHash: hashRefreshToken(refreshToken),
		tokenVersion,
		expiresAt,
		...metadata
	}).returning();
	if (!session) throw new Error('Unable to create authentication session.');
	return {
		accessToken: await issueAccessToken({ context: 'personal', sessionId: session.id, tokenVersion, userId }),
		refreshToken,
		expiresAt,
		sessionId: session.id
	};
}

export class AuthController {
	/** Creates a generic, enumeration-safe WhatsApp OTP challenge. */
	public static async requestOtp(input: RequestOtpInput, metadata: RequestMetadata, provider: OtpDeliveryProvider = new Msg91OtpProvider()): Promise<Response> {
		try {
			const environment = getEnvironment();
			const secret = requireOtpSecret();
			const identityHash = hashSensitiveValue(input.localMobileNumber, secret);
			const [cooldownChallenge] = await db.select().from(otpChallenges).where(and(
				eq(otpChallenges.identityHash, identityHash),
				isNull(otpChallenges.deletedAt),
				gt(otpChallenges.resendAvailableAt, new Date())
			)).orderBy(otpChallenges.createdAt).limit(1);
			if (cooldownChallenge) {
				return resp.success('If the mobile number is eligible, a WhatsApp OTP has been sent.', {
					challengeId: cooldownChallenge.id,
					expiresAt: cooldownChallenge.expiresAt,
					resendAvailableAt: cooldownChallenge.resendAvailableAt
				}, resp.codes.ACCEPTED, undefined, 202);
			}
			const candidates = await db.select().from(users).where(and(
				eq(users.localMobileNumber, input.localMobileNumber),
				eq(users.status, 'active'),
				isNull(users.deletedAt)
			)).limit(2);
			const user = candidates.length === 1 ? candidates[0] : undefined;
			let deliveryStatus: 'submitted' | 'failed' = 'failed';
			let providerReference: string | undefined;
			let generatedCode = createOtpSalt();
			if (user) {
				try {
					const delivery = await provider.send(user.mobileE164);
					generatedCode = delivery.code;
					providerReference = delivery.providerReference;
					deliveryStatus = 'submitted';
				} catch {
					deliveryStatus = 'failed';
				}
			}
			const otpSalt = createOtpSalt();
			const now = Date.now();
			const [challenge] = await db.insert(otpChallenges).values({
				userId: user?.id,
				identityHash,
				maskedDestination: maskMobile(input.localMobileNumber),
				otpHash: hashOtp(generatedCode, otpSalt, secret),
				otpSalt,
				deliveryStatus,
				providerReference,
				maxAttempts: environment.OTP_MAX_ATTEMPTS,
				expiresAt: new Date(now + environment.OTP_TTL_MINUTES * 60_000),
				resendAvailableAt: new Date(now + environment.OTP_RESEND_COOLDOWN_SECONDS * 1_000),
				requestIpHash: metadata.ipAddress ? hashSensitiveValue(metadata.ipAddress, secret) : undefined,
				userAgent: metadata.userAgent
			}).returning();
			if (!challenge) throw new Error('Unable to create OTP challenge.');

			await db.insert(authenticationEvents).values({
				userId: user?.id,
				challengeId: challenge.id,
				identityHash,
				type: deliveryStatus === 'submitted' ? 'otp_requested' : 'otp_delivery_failed',
				status: deliveryStatus === 'submitted' ? 'success' : 'failure',
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent
			});
			return resp.success('If the mobile number is eligible, a WhatsApp OTP has been sent.', {
				challengeId: challenge.id,
				expiresAt: challenge.expiresAt,
				resendAvailableAt: challenge.resendAvailableAt
			}, resp.codes.ACCEPTED, undefined, 202);
		} catch {
			return resp.failure('Unable to request OTP.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
		}
	}

	/** Verifies a one-time challenge once and creates a multi-device session. */
	public static async verifyOtp(input: VerifyOtpInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const now = new Date();
			const [challenge] = await db.select().from(otpChallenges).where(and(
				eq(otpChallenges.id, input.challengeId),
				eq(otpChallenges.deliveryStatus, 'submitted'),
				isNull(otpChallenges.consumedAt),
				isNull(otpChallenges.deletedAt),
				gt(otpChallenges.expiresAt, now)
			)).limit(1);
			if (!challenge?.userId || challenge.attemptCount >= challenge.maxAttempts) {
				return resp.failure('OTP is invalid or expired.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			}
			const valid = verifyOtpHash(input.otp, challenge.otpSalt, challenge.otpHash, requireOtpSecret());
			if (!valid) {
				await db.update(otpChallenges).set({ attemptCount: challenge.attemptCount + 1, updatedAt: now }).where(eq(otpChallenges.id, challenge.id));
				await db.insert(authenticationEvents).values({ userId: challenge.userId, challengeId: challenge.id, type: 'otp_verification_failed', status: 'failure', reason: 'invalid_otp', ...metadata });
				return resp.failure('OTP is invalid or expired.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			}
			const [user] = await db.select().from(users).where(and(eq(users.id, challenge.userId), eq(users.status, 'active'), isNull(users.deletedAt))).limit(1);
			if (!user) return resp.failure('Account is inactive.', resp.codes.ACCOUNT_INACTIVE, undefined, null, undefined, 422);
			const [consumedChallenge] = await db.update(otpChallenges)
				.set({ consumedAt: now, updatedAt: now })
				.where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
				.returning({ id: otpChallenges.id });
			if (!consumedChallenge) return resp.failure('OTP is invalid or expired.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			await db.update(users).set({ mobileVerifiedAt: now, updatedAt: now }).where(eq(users.id, user.id));
			const session = await createSession(user.id, user.tokenVersion, metadata);
			await db.insert(authenticationEvents).values({ userId: user.id, challengeId: challenge.id, type: 'login_succeeded', status: 'success', ...metadata });
			return resp.success('Authentication successful.', { user: { id: user.id, displayName: user.displayName }, context: 'personal' }, resp.codes.OK, session);
		} catch {
			return resp.failure('Unable to verify OTP.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
		}
	}

	/** Rotates the opaque refresh token and returns a fresh access token. */
	public static async refresh(refreshToken: string): Promise<Response> {
		try {
			const hash = hashRefreshToken(refreshToken);
			const [session] = await db.select().from(userSessions).where(and(eq(userSessions.refreshTokenHash, hash), isNull(userSessions.revokedAt), isNull(userSessions.deletedAt), gt(userSessions.expiresAt, new Date()))).limit(1);
			if (!session) return resp.failure('Refresh token is invalid or expired.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			const [user] = await db.select().from(users).where(and(eq(users.id, session.userId), eq(users.status, 'active'), eq(users.tokenVersion, session.tokenVersion), isNull(users.deletedAt))).limit(1);
			if (!user) return resp.failure('Session is no longer valid.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			const rotated = createRefreshToken();
			await db.update(userSessions).set({ refreshTokenHash: hashRefreshToken(rotated), lastActiveAt: new Date(), updatedAt: new Date() }).where(eq(userSessions.id, session.id));
			const accessToken = await issueAccessToken({ context: session.activeContextType, sessionId: session.id, tokenVersion: session.tokenVersion, userId: user.id });
			return resp.success('Session refreshed.', null, resp.codes.OK, { accessToken, refreshToken: rotated });
		} catch {
			return resp.failure('Unable to refresh session.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
		}
	}

	/** Revokes the current access-token session. */
	public static async logout(request: Request): Promise<Response> {
		try {
			const token = getBearerToken(request);
			if (!token) throw new Error('Missing token.');
			const claims = await verifyAccessToken(token);
			await db.update(userSessions).set({ revokedAt: new Date(), revokeReason: 'user_logout', updatedAt: new Date() }).where(and(eq(userSessions.id, claims.sessionId), eq(userSessions.userId, claims.userId), isNull(userSessions.revokedAt)));
			return resp.success('Session revoked.');
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}

	/** Switches only to contexts granted by current database assignments. */
	public static async switchContext(request: Request, context: Exclude<SessionContext, 'organisation'>): Promise<Response> {
		try {
			const token = getBearerToken(request);
			if (!token) throw new Error('Missing token.');
			const claims = await verifyAccessToken(token);
			const [session] = await db.select().from(userSessions).where(and(eq(userSessions.id, claims.sessionId), eq(userSessions.userId, claims.userId), isNull(userSessions.revokedAt), isNull(userSessions.deletedAt), gt(userSessions.expiresAt, new Date()))).limit(1);
			if (!session || session.tokenVersion !== claims.tokenVersion) throw new Error('Invalid session.');
			if (context === 'admin') {
				const [assignment] = await db.select({ id: platformUserRoles.id }).from(platformUserRoles).where(and(eq(platformUserRoles.userId, claims.userId), isNull(platformUserRoles.deletedAt), or(isNull(platformUserRoles.expiresAt), gt(platformUserRoles.expiresAt, new Date())))).limit(1);
				if (!assignment) return resp.failure('Admin context is not permitted.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403);
			}
			await db.update(userSessions).set({ activeContextType: context, updatedAt: new Date(), lastActiveAt: new Date() }).where(eq(userSessions.id, session.id));
			const accessToken = await issueAccessToken({ context, sessionId: session.id, tokenVersion: session.tokenVersion, userId: claims.userId });
			return resp.success('Context switched.', { context }, resp.codes.OK, { accessToken });
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}
}
