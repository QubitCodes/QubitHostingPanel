import type { AppEnvironment } from '@config/env';

export const DEVELOPMENT_AUTH_BYPASS_PREFIX = '~~';

/** Removes the development-only marker without altering the canonical mobile digits. */
export function parseDevelopmentAuthMobile(mobile: string): { bypassRequested: boolean; mobile: string } {
	const bypassRequested = mobile.startsWith(DEVELOPMENT_AUTH_BYPASS_PREFIX);
	return {
		bypassRequested,
		mobile: bypassRequested ? mobile.slice(DEVELOPMENT_AUTH_BYPASS_PREFIX.length) : mobile,
	};
}

/** Allows OTP bypass only in an explicitly enabled local development runtime. */
export function canUseDevelopmentAuthBypass(environment: AppEnvironment, request: Request): boolean {
	if (environment.ENABLE_DEV_AUTH_BYPASS !== 'true' || environment.APP_ENV !== 'development' || process.env.NODE_ENV !== 'development') return false;
	const hostname = new URL(request.url).hostname.toLowerCase();
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}
