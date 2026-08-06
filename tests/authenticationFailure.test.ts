import { errors } from 'jose';
import { describe, expect, it } from 'vitest';

import { authenticationFailureResponse, isAuthenticationFailure } from '@services/auth/authenticationFailureService';

describe('authentication failure responses', () => {
	it('maps expired JWT failures to a refresh-triggering 401', async () => {
		const error = new errors.JWTExpired('"exp" claim timestamp check failed', { exp: 0 }, 'exp', 'check_failed');
		expect(isAuthenticationFailure(error)).toBe(true);
		const response = authenticationFailureResponse(error);
		expect(response?.status).toBe(401);
		expect(await response?.json()).toMatchObject({ code: 210, message: 'Authentication required.', status: false });
	});

	it('does not misclassify operational errors', () => {
		expect(isAuthenticationFailure(new Error('Database connection failed.'))).toBe(false);
		expect(authenticationFailureResponse(new Error('Database connection failed.'))).toBeUndefined();
	});
});
