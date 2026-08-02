import { describe, expect, it } from 'vitest';

import { safeAuthenticationReturn } from '@root/app/utils/authReturn';

describe('authentication return routes', () => {
	it('keeps application-local paths including selected checkout routes', () => {
		expect(safeAuthenticationReturn('/checkout/launch/price-123')).toBe('/checkout/launch/price-123');
		expect(safeAuthenticationReturn('/workspace/123456/overview')).toBe('/workspace/123456/overview');
	});

	it('rejects login loops and external destinations', () => {
		expect(safeAuthenticationReturn('/login')).toBeUndefined();
		expect(safeAuthenticationReturn('/login/verify/challenge')).toBeUndefined();
		expect(safeAuthenticationReturn('//example.com/account')).toBeUndefined();
		expect(safeAuthenticationReturn('https://example.com/account')).toBeUndefined();
	});
});
