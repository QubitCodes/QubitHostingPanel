import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';
import { getCountryCallingCode, isSupportedCountry, type CountryCode } from 'libphonenumber-js';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { authenticationEvents, authenticationHandoffs, otpChallenges, platformUserRoles, userSessions, users } from '@db/schema';
import type { CreateAuthenticationHandoffInput, ConsumeAuthenticationHandoffInput, RequestOtpInput, ResendOtpInput, ResolveMobileCountryInput, VerifyOtpInput } from '@schemas/auth';
import { Msg91OtpProvider, type OtpDeliveryProvider } from '@services/auth/Msg91OtpProvider';
import { canUseDevelopmentAuthBypass, parseDevelopmentAuthMobile } from '@services/auth/developmentAuthBypassService';
import { createOtpSalt, hashOtp, hashSensitiveValue, verifyOtpHash } from '@services/auth/otpCryptoService';
import { createRefreshToken, hashRefreshToken, issueAccessToken, verifyAccessToken, type SessionContext } from '@services/auth/tokenService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import { hasCustomerDashboardAccess } from '@services/authorization/customerDashboardAccessService';
import { API_DOCS_COOKIE, API_DOCS_PERMISSION } from '@services/authorization/apiDocsAuthorizationService';
import { ensureCustomer, ensureCustomerForUser } from '@services/customerWorkspaceService';
import type { RequestMetadata } from '@utils/request';
import { getEffectivePlatformUrls } from '@services/platformUrlService';
import { decryptCredential, encryptCredential } from '@services/encryption/credentialEncryptionService';

function maskMobile(value: string): string {
	return value.length <= 4 ? '*'.repeat(value.length) : `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

/** Reuses an encrypted OTP only while its expiry is strictly more than one minute away. */
export function shouldReuseOtpCode(expiresAt: Date, now: Date, hasCiphertext: boolean): boolean {
	return hasCiphertext && expiresAt.getTime() - now.getTime() > 60_000;
}

async function hasActiveAdminRole(userId: string): Promise<boolean> {
	const [assignment] = await db.select({ id: platformUserRoles.id }).from(platformUserRoles).where(and(
		eq(platformUserRoles.userId, userId),
		isNull(platformUserRoles.deletedAt),
		or(isNull(platformUserRoles.expiresAt), gt(platformUserRoles.expiresAt, new Date())),
	)).limit(1);
	return Boolean(assignment);
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

const hashHandoffToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Builds the short-lived, API-scoped cookie used only for documentation GET requests. */
function apiDocsCookie(value: string, maximumAgeSeconds: number): string {
	const secure = getEnvironment().APP_ENV === 'production' ? '; Secure' : '';
	return `${API_DOCS_COOKIE}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maximumAgeSeconds}${secure}`;
}

async function createSession(userId: string, tokenVersion: number, metadata: RequestMetadata) {
	const environment = getEnvironment();
	const refreshToken = createRefreshToken();
	const expiresAt = new Date(Date.now() + environment.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
	const { deviceIdentifier, ...sessionClient } = metadata.sessionClient;
	const [session] = await db.insert(userSessions).values({
		userId,
		refreshTokenHash: hashRefreshToken(refreshToken),
		tokenVersion,
		expiresAt,
		ipAddress: metadata.ipAddress,
		userAgent: metadata.userAgent,
		...sessionClient,
		deviceIdentifierHash: deviceIdentifier
			? hashSensitiveValue(deviceIdentifier, requireOtpSecret())
			: undefined
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
	/** Determines whether an unprefixed national number needs an explicit country selection. */
	public static async resolveMobileCountry(input: ResolveMobileCountryInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const candidates = await db.select({ id: users.id }).from(users).where(and(
				eq(users.mobile, input.mobile),
				eq(users.status, 'active'),
				isNull(users.deletedAt),
			)).limit(2);
			const detectedCountry = metadata.sessionClient.countryCode?.toUpperCase();
			const country = detectedCountry && isSupportedCountry(detectedCountry) ? detectedCountry as CountryCode : 'IN';
			return resp.success('Mobile country requirement resolved.', {
				countryCodeRequired: candidates.length !== 1,
				suggestedCountryCode: `+${getCountryCallingCode(country)}`,
			});
		} catch (error) {
			console.error('Unable to resolve mobile country.', error);
			return resp.failure('Unable to resolve mobile country.', resp.codes.DATABASE_ERROR, undefined, null, undefined, 500);
		}
	}

	/** Creates a generic, enumeration-safe WhatsApp OTP challenge. */
	public static async requestOtp(input: RequestOtpInput, metadata: RequestMetadata, provider: OtpDeliveryProvider = new Msg91OtpProvider(), request?: Request): Promise<Response> {
		try {
			const environment = getEnvironment();
			const secret = requireOtpSecret();
			const parsedMobile = parseDevelopmentAuthMobile(input.mobile);
			const countryCode = input.countryCode ? `+${input.countryCode.replace(/\D/g, '')}` : undefined;
			const identityKey = countryCode ? `${countryCode}${parsedMobile.mobile}` : parsedMobile.mobile;
			const identityHash = hashSensitiveValue(identityKey, secret);
			if (parsedMobile.bypassRequested) {
				if (!request || !canUseDevelopmentAuthBypass(environment, request)) return resp.failure('Development authentication is unavailable.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
				const candidates = await db.select().from(users).where(and(
					eq(users.mobile, parsedMobile.mobile),
					...(countryCode ? [eq(users.countryCode, countryCode)] : []),
					eq(users.status, 'active'),
					isNotNull(users.mobileVerifiedAt),
					isNull(users.deletedAt),
				)).limit(2);
				const user = candidates.length === 1 ? candidates[0] : undefined;
				if (!user) return resp.failure('Development authentication is unavailable.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
				await ensureCustomerForUser(user.id);
				const session = await createSession(user.id, user.tokenVersion, metadata);
				await db.insert(authenticationEvents).values({
					userId: user.id,
					identityHash,
					type: 'login_succeeded',
					status: 'success',
					reason: 'development_bypass',
					ipAddress: metadata.ipAddress,
					userAgent: metadata.userAgent,
					metadata: { authenticationMethod: 'development_bypass' },
				});
				const [hasAdminAccess, customerDashboardAccess] = await Promise.all([hasActiveAdminRole(user.id), hasCustomerDashboardAccess(user.id)]);
				return resp.success('Authentication successful.', { user: { id: user.id, displayName: user.displayName, countryCode: user.countryCode, mobile: user.mobile, mobileE164: `${user.countryCode}${user.mobile}`, hasAdminAccess, hasCustomerDashboardAccess: customerDashboardAccess }, context: 'personal' }, resp.codes.OK, session);
			}
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
				eq(users.mobile, parsedMobile.mobile),
				...(countryCode ? [eq(users.countryCode, countryCode)] : []),
				eq(users.status, 'active'),
				isNull(users.deletedAt)
			)).limit(2);
			const user = candidates.length === 1 ? candidates[0] : undefined;
			let deliveryStatus: 'submitted' | 'failed' = 'failed';
			let providerReference: string | undefined;
			let generatedCode = createOtpSalt();
			const deliveryTarget = user ? `${user.countryCode}${user.mobile}` : countryCode ? identityKey : undefined;
			if (deliveryTarget) {
				try {
					const delivery = await provider.send(deliveryTarget);
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
				maskedDestination: maskMobile(identityKey),
				countryCode,
				mobile: parsedMobile.mobile,
				otpHash: hashOtp(generatedCode, otpSalt, secret),
				otpSalt,
				otpCiphertext: deliveryStatus === 'submitted' ? encryptCredential(generatedCode) : null,
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
		} catch (error) {
			console.error('Unable to request OTP.', error);
			return resp.failure('Unable to request OTP.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
		}
	}

	/** Resends a valid code, rotating it only during the final minute of its lifetime. */
	public static async resendOtp(input: ResendOtpInput, metadata: RequestMetadata, provider: OtpDeliveryProvider = new Msg91OtpProvider()): Promise<Response> {
		try {
			const environment = getEnvironment();
			const now = new Date();
			const [challenge] = await db.select().from(otpChallenges).where(and(eq(otpChallenges.id, input.challengeId), eq(otpChallenges.deliveryStatus, 'submitted'), isNull(otpChallenges.consumedAt), isNull(otpChallenges.deletedAt), gt(otpChallenges.expiresAt, now))).limit(1);
			if (!challenge || challenge.resendAvailableAt > now || !challenge.countryCode || !challenge.mobile) return resp.failure('OTP cannot be resent yet or has expired.', resp.codes.RATE_LIMIT_EXCEEDED, undefined, null, undefined, 429);
			const reuseCurrentCode = shouldReuseOtpCode(challenge.expiresAt, now, Boolean(challenge.otpCiphertext));
			const currentCode = reuseCurrentCode ? decryptCredential(challenge.otpCiphertext!) : undefined;
			const delivery = await provider.send(`${challenge.countryCode}${challenge.mobile}`, currentCode);
			const otpSalt = reuseCurrentCode ? challenge.otpSalt : createOtpSalt();
			const expiresAt = reuseCurrentCode ? challenge.expiresAt : new Date(now.getTime() + environment.OTP_TTL_MINUTES * 60_000);
			const [updated] = await db.update(otpChallenges).set({ otpHash: reuseCurrentCode ? challenge.otpHash : hashOtp(delivery.code, otpSalt, requireOtpSecret()), otpSalt, otpCiphertext: encryptCredential(delivery.code), providerReference: delivery.providerReference, expiresAt, resendAvailableAt: new Date(now.getTime() + environment.OTP_RESEND_COOLDOWN_SECONDS * 1_000), updatedAt: now }).where(eq(otpChallenges.id, challenge.id)).returning();
			if (!updated) throw new Error('Unable to update OTP challenge.');
			await db.insert(authenticationEvents).values({ userId: challenge.userId, challengeId: challenge.id, identityHash: challenge.identityHash, type: 'otp_requested', status: 'success', reason: reuseCurrentCode ? 'same_code_resent' : 'code_rotated', ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success(reuseCurrentCode ? 'The current WhatsApp code was resent.' : 'A new WhatsApp code was sent.', { challengeId: updated.id, expiresAt: updated.expiresAt, resendAvailableAt: updated.resendAvailableAt }, resp.codes.ACCEPTED, undefined, 202);
		} catch {
			return resp.failure('Unable to resend OTP.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
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
			if (!challenge || challenge.attemptCount >= challenge.maxAttempts) {
				return resp.failure('OTP is invalid or expired.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			}
			const valid = verifyOtpHash(input.otp, challenge.otpSalt, challenge.otpHash, requireOtpSecret());
			if (!valid) {
				await db.update(otpChallenges).set({ attemptCount: challenge.attemptCount + 1, updatedAt: now }).where(eq(otpChallenges.id, challenge.id));
				await db.insert(authenticationEvents).values({ userId: challenge.userId, challengeId: challenge.id, type: 'otp_verification_failed', status: 'failure', reason: 'invalid_otp', ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
				return resp.failure('OTP is invalid or expired.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			}
			if (challenge.userId) {
				const [activeUser] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, challenge.userId), eq(users.status, 'active'), isNull(users.deletedAt))).limit(1);
				if (!activeUser) return resp.failure('Account is inactive.', resp.codes.ACCOUNT_INACTIVE, undefined, null, undefined, 422);
			}
			const user = await db.transaction(async (transaction) => {
				const [consumedChallenge] = await transaction.update(otpChallenges)
					.set({ consumedAt: now, otpCiphertext: null, updatedAt: now })
					.where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
					.returning({ id: otpChallenges.id });
				if (!consumedChallenge) throw new Error('OTP challenge was already consumed.');
				let [authenticatedUser] = challenge.userId
					? await transaction.select().from(users).where(and(eq(users.id, challenge.userId), eq(users.status, 'active'), isNull(users.deletedAt))).limit(1)
					: [];
				if (!authenticatedUser) {
					if (!challenge.countryCode || !challenge.mobile) throw new Error('Registration identity is incomplete.');
					await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${challenge.identityHash}, 0))`);
					[authenticatedUser] = await transaction.select().from(users).where(and(eq(users.countryCode, challenge.countryCode), eq(users.mobile, challenge.mobile), isNull(users.deletedAt))).limit(1);
					if (!authenticatedUser) [authenticatedUser] = await transaction.insert(users).values({ countryCode: challenge.countryCode, mobile: challenge.mobile, mobileVerifiedAt: now }).returning();
				}
				if (!authenticatedUser || authenticatedUser.status !== 'active') throw new Error('Account is inactive.');
				await transaction.update(users).set({ mobileVerifiedAt: now, updatedAt: now }).where(eq(users.id, authenticatedUser.id));
				await ensureCustomer(transaction, authenticatedUser.id);
				return authenticatedUser;
			});
			const session = await createSession(user.id, user.tokenVersion, metadata);
			await db.insert(authenticationEvents).values({ userId: user.id, challengeId: challenge.id, type: 'login_succeeded', status: 'success', ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			const [hasAdminAccess, customerDashboardAccess] = await Promise.all([hasActiveAdminRole(user.id), hasCustomerDashboardAccess(user.id)]);
			return resp.success('Authentication successful.', { user: { id: user.id, displayName: user.displayName, countryCode: user.countryCode, mobile: user.mobile, mobileE164: `${user.countryCode}${user.mobile}`, hasAdminAccess, hasCustomerDashboardAccess: customerDashboardAccess }, context: 'personal' }, resp.codes.OK, session);
		} catch {
			return resp.failure('Unable to verify OTP.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
		}
	}

	/** Rotates the opaque refresh token and returns a fresh access token. */
	public static async createHandoff(request: Request, input: CreateAuthenticationHandoffInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const urls = await getEffectivePlatformUrls();
			const databaseTarget = input.targetPath.startsWith('/database/');
			if (!databaseTarget && (urls.panelDomainMode !== 'separate_domain' || !urls.panelDomainReady)) return resp.failure('A verified separate panel domain is not active.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
			if (input.targetPath === '/admin/overview' && !await hasActiveAdminRole(authenticated.userId)) return resp.failure('Admin dashboard access is not permitted.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403);
			if ((input.targetPath === '/dashboard' || databaseTarget) && !await hasCustomerDashboardAccess(authenticated.userId)) return resp.failure('Customer dashboard access is not permitted.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403);
			const token = randomBytes(48).toString('base64url');
			const targetOrigin = databaseTarget ? new URL(request.url).origin : new URL(urls.panelBaseUrl).origin;
			await db.insert(authenticationHandoffs).values({ userId: authenticated.userId, sourceSessionId: authenticated.sessionId, tokenHash: hashHandoffToken(token), targetOrigin, targetPath: input.targetPath, expiresAt: new Date(Date.now() + 2 * 60_000) });
			return resp.success('Secure panel handoff created.', { handoffUrl: new URL(`/auth/handoff#token=${encodeURIComponent(token)}`, targetOrigin).toString() }, resp.codes.CREATED, undefined, 201);
		} catch { return resp.failure('Unable to create panel handoff.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401); }
	}

	public static async consumeHandoff(request: Request, input: ConsumeAuthenticationHandoffInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const requestOrigin = new URL(request.url).origin;
			const [handoff] = await db.update(authenticationHandoffs).set({ consumedAt: new Date(), updatedAt: new Date() }).where(and(eq(authenticationHandoffs.tokenHash, hashHandoffToken(input.token)), eq(authenticationHandoffs.targetOrigin, requestOrigin), isNull(authenticationHandoffs.consumedAt), isNull(authenticationHandoffs.deletedAt), gt(authenticationHandoffs.expiresAt, new Date()))).returning();
			if (!handoff) return resp.failure('Panel handoff is invalid or expired.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			const [user] = await db.select().from(users).where(and(eq(users.id, handoff.userId), eq(users.status, 'active'), isNull(users.deletedAt))).limit(1);
			if (!user) return resp.failure('Account is inactive.', resp.codes.ACCOUNT_INACTIVE, undefined, null, undefined, 422);
			const session = await createSession(user.id, user.tokenVersion, metadata);
			const [hasAdminAccess, customerDashboardAccess] = await Promise.all([hasActiveAdminRole(user.id), hasCustomerDashboardAccess(user.id)]);
			return resp.success('Panel session established.', { targetPath: handoff.targetPath, user: { id: user.id, displayName: user.displayName, countryCode: user.countryCode, mobile: user.mobile, mobileE164: `${user.countryCode}${user.mobile}`, hasAdminAccess, hasCustomerDashboardAccess: customerDashboardAccess } }, resp.codes.OK, session);
		} catch { return resp.failure('Unable to consume panel handoff.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401); }
	}

	/** Rotates the opaque refresh token and returns a fresh access token. */
	public static async profile(request: Request, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const [user] = await db.select({ countryCode: users.countryCode, displayName: users.displayName, id: users.id, mobile: users.mobile }).from(users).where(and(eq(users.id, authenticated.userId), eq(users.status, 'active'), isNull(users.deletedAt))).limit(1);
			if (!user) return resp.failure('Account not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const [hasAdminAccess, customerDashboardAccess] = await Promise.all([hasActiveAdminRole(user.id), hasCustomerDashboardAccess(user.id)]);
			return resp.success('Authenticated user retrieved.', { ...user, mobileE164: `${user.countryCode}${user.mobile}`, hasAdminAccess, hasCustomerDashboardAccess: customerDashboardAccess });
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}

	/** Rotates the opaque refresh token and returns a fresh access token. */
	public static async refresh(refreshToken: string, metadata?: RequestMetadata): Promise<Response> {
		try {
			const hash = hashRefreshToken(refreshToken);
			const [session] = await db.select().from(userSessions).where(and(eq(userSessions.refreshTokenHash, hash), isNull(userSessions.revokedAt), isNull(userSessions.deletedAt), gt(userSessions.expiresAt, new Date()))).limit(1);
			if (!session) return resp.failure('Refresh token is invalid or expired.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			const [user] = await db.select().from(users).where(and(eq(users.id, session.userId), eq(users.status, 'active'), eq(users.tokenVersion, session.tokenVersion), isNull(users.deletedAt))).limit(1);
			if (!user) return resp.failure('Session is no longer valid.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
			const rotated = createRefreshToken();
			await db.update(userSessions).set({ refreshTokenHash: hashRefreshToken(rotated), lastActiveAt: new Date(), updatedAt: new Date(), ipAddress: metadata?.ipAddress ?? session.ipAddress, userAgent: metadata?.userAgent ?? session.userAgent }).where(eq(userSessions.id, session.id));
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
			const response = resp.success('Session revoked.');
			response.headers.append('set-cookie', apiDocsCookie('', 0));
			return response;
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
			let canViewApiDocs = false;
			if (context === 'admin') {
				const headers = new Headers(request.headers);
				headers.set('authorization', `Bearer ${accessToken}`);
				try {
					await authorizeAdmin(new Request(request.url, { headers }), API_DOCS_PERMISSION, {
						sessionClient: { clientHints: {} },
					});
					canViewApiDocs = true;
				} catch {
					canViewApiDocs = false;
				}
			}
			const response = resp.success('Context switched.', { canViewApiDocs, context }, resp.codes.OK, { accessToken });
			response.headers.append(
				'set-cookie',
				apiDocsCookie(
					canViewApiDocs ? accessToken : '',
					canViewApiDocs ? getEnvironment().ACCESS_TOKEN_TTL_MINUTES * 60 : 0,
				),
			);
			return response;
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}
}
