import { afterEach, describe, expect, it } from 'vitest';

import { sanitizeDevelopmentBypassMarker } from '@root/app/components/forms/phone-number-input';
import type { AppEnvironment } from '@config/env';
import { canUseDevelopmentAuthBypass, parseDevelopmentAuthMobile } from '@services/auth/developmentAuthBypassService';

const originalNodeEnvironment = process.env.NODE_ENV;

afterEach(() => {
	process.env.NODE_ENV = originalNodeEnvironment;
});

describe('development authentication bypass', () => {
	it('keeps a leading marker while removing tildes after digits', () => {
		expect(sanitizeDevelopmentBypassMarker('~~9400~143527', true)).toEqual({ prefix: '~~', phoneValue: '9400143527' });
		expect(sanitizeDevelopmentBypassMarker('9400~~143527', true)).toEqual({ prefix: '', phoneValue: '9400143527' });
		expect(sanitizeDevelopmentBypassMarker('~9400143527', true)).toEqual({ prefix: '~', phoneValue: '9400143527' });
		expect(sanitizeDevelopmentBypassMarker('~~9400143527', false)).toEqual({ prefix: '', phoneValue: '9400143527' });
	});

	it('strips the marker before database identity lookup', () => {
		expect(parseDevelopmentAuthMobile('~~9400143527')).toEqual({ bypassRequested: true, mobile: '9400143527' });
		expect(parseDevelopmentAuthMobile('9400143527')).toEqual({ bypassRequested: false, mobile: '9400143527' });
	});

	it('requires the flag, development runtime, and loopback URL together', () => {
		process.env.NODE_ENV = 'development';
		const environment = { APP_ENV: 'development', ENABLE_DEV_AUTH_BYPASS: 'true' } as AppEnvironment;
		expect(canUseDevelopmentAuthBypass(environment, new Request('http://localhost:5173/api/v1/auth/otp/request'))).toBe(true);
		expect(canUseDevelopmentAuthBypass(environment, new Request('https://panel.qubit.codes/api/v1/auth/otp/request'))).toBe(false);
		expect(canUseDevelopmentAuthBypass({ ...environment, ENABLE_DEV_AUTH_BYPASS: 'false' }, new Request('http://localhost:5173/api/v1/auth/otp/request'))).toBe(false);
		process.env.NODE_ENV = 'production';
		expect(canUseDevelopmentAuthBypass(environment, new Request('http://localhost:5173/api/v1/auth/otp/request'))).toBe(false);
	});
});
