import { resp } from '@qubitcodes/qcresp';

/** Identifies authentication failures without exposing JWT-library details. */
export function isAuthenticationFailure(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const code = 'code' in error ? String(error.code) : '';
	return code === 'ERR_JWT_EXPIRED' || code.startsWith('ERR_JWT_') || error.message === 'Authentication required.' || error.message === 'Session is invalid.';
}

/** Returns the standard refresh-triggering response for an authentication failure. */
export function authenticationFailureResponse(error: unknown): Response | undefined {
	return isAuthenticationFailure(error) ? resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401) : undefined;
}
