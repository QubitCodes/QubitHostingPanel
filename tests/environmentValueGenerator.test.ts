import { describe, expect, it } from 'vitest';

import { generateEnvironmentValue, hashEnvironmentValue, inferEnvironmentValueKind } from '@root/app/utils/environmentValueGenerator';

describe('environment value generator', () => {
	it('infers conventional field helpers', () => {
		expect(inferEnvironmentValueKind('APP_DEBUG')).toBe('boolean');
		expect(inferEnvironmentValueKind('DB_PASSWORD')).toBe('password');
		expect(inferEnvironmentValueKind('DATABASE_URL')).toBe('configuration');
		expect(inferEnvironmentValueKind('JWT_SECRET')).toBe('framework');
	});

	it('creates strong passwords and framework secrets', () => {
		const password = generateEnvironmentValue({ kind: 'password', length: 40 });
		expect(password).toHaveLength(40);
		expect(password).toMatch(/[A-Z]/);
		expect(password).toMatch(/[a-z]/);
		expect(password).toMatch(/[0-9]/);
		expect(generateEnvironmentValue({ framework: 'laravel', kind: 'framework' })).toMatch(/^base64:/);
	});

	it('creates deterministic one-way digests', async () => {
		await expect(hashEnvironmentValue('ghost-deploy', 'SHA-256')).resolves.toBe('0ae5411eac5934ea99d3030e74f35a839b7f04f003e950a151f2c13c176f82c1');
	});
});
