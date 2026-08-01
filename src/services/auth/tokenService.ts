import { createHmac, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

import { getEnvironment } from '@config/env';

export type SessionContext = 'personal' | 'admin' | 'organisation';

export interface AccessTokenClaims {
	context: SessionContext;
	sessionId: string;
	tokenVersion: number;
	userId: string;
}

function secret(value: string | undefined, name: string): Uint8Array {
	if (!value || value.length < 32) throw new Error(`${name} must contain at least 32 characters.`);
	return new TextEncoder().encode(value);
}

export async function issueAccessToken(claims: AccessTokenClaims): Promise<string> {
	const environment = getEnvironment();
	return new SignJWT({ context: claims.context, sid: claims.sessionId, ver: claims.tokenVersion })
		.setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
		.setSubject(claims.userId)
		.setIssuedAt()
		.setExpirationTime(`${environment.ACCESS_TOKEN_TTL_MINUTES}m`)
		.sign(secret(environment.JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET'));
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
	const { payload } = await jwtVerify(token, secret(getEnvironment().JWT_ACCESS_SECRET, 'JWT_ACCESS_SECRET'));
	if (!payload.sub || typeof payload.sid !== 'string' || typeof payload.context !== 'string' || typeof payload.ver !== 'number') {
		throw new Error('Access token claims are invalid.');
	}
	return { context: payload.context as SessionContext, sessionId: payload.sid, tokenVersion: payload.ver, userId: payload.sub };
}

export function createRefreshToken(): string {
	return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string): string {
	const environment = getEnvironment();
	return createHmac('sha256', Buffer.from(secret(environment.JWT_REFRESH_SECRET, 'JWT_REFRESH_SECRET'))).update(token).digest('hex');
}

