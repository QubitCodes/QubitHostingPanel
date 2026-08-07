import { describe, expect, it } from 'vitest';

import {
	autofillKnownEnvironmentValues,
	bestEnvironmentConfigurationLabel,
	generateEnvironmentValue,
	hashEnvironmentValue,
	inferEnvironmentValueKind,
	regionalEnvironmentConfiguration,
} from '@root/app/utils/environmentValueGenerator';

describe('environment value generator', () => {
	it('infers conventional field helpers', () => {
		expect(inferEnvironmentValueKind('APP_DEBUG')).toBe('boolean');
		expect(inferEnvironmentValueKind('DB_PASSWORD')).toBe('password');
		expect(inferEnvironmentValueKind('DATABASE_URL')).toBe('configuration');
		expect(inferEnvironmentValueKind('JWT_SECRET')).toBe('framework');
		expect(inferEnvironmentValueKind('TZ')).toBe('configuration');
		expect(inferEnvironmentValueKind('APP_LOCALE')).toBe('configuration');
	});

	it('selects the closest application configuration value for an environment key', () => {
		const values = [
			{ label: 'Application URL', value: 'https://demo.ghostdeploy.com' },
			{ label: 'Database password', value: 'secret', secret: true },
			{ label: 'Timezone', value: 'Asia/Calcutta' },
		];
		expect(bestEnvironmentConfigurationLabel('APP_URL', values)).toBe('Application URL');
		expect(bestEnvironmentConfigurationLabel('DB_PASSWORD', values)).toBe('Database password');
		expect(bestEnvironmentConfigurationLabel('TZ', values)).toBe('Timezone');
		expect(bestEnvironmentConfigurationLabel('UNRELATED_KEY', values)).toBe('');
	});

	it('derives regional configuration from the browser locale and timezone', () => {
		expect(regionalEnvironmentConfiguration('en-IN', 'Asia/Calcutta')).toEqual([
			{ label: 'Timezone', value: 'Asia/Calcutta' },
			{ label: 'UTC timezone', value: 'UTC' },
			{ label: 'Locale', value: 'en-IN' },
			{ label: 'POSIX locale', value: 'en_IN.UTF-8' },
			{ label: 'Country', value: 'IN' },
			{ label: 'Currency', value: 'INR' },
		]);
	});

	it('autofills only empty values with reliable mappings and preserves supplied values', () => {
		const result = autofillKnownEnvironmentValues({
			configurationValues: [
				{ label: 'Application URL', value: 'https://demo.ghostdeploy.com' },
				{ label: 'Database password', value: 'database-secret', secret: true },
				{ label: 'Timezone', value: 'Asia/Calcutta' },
			],
			deploymentEnvironment: 'production',
			framework: 'laravel',
			variables: [
				{ key: 'APP_URL', value: '', isSecret: false },
				{ key: 'APP_DEBUG', value: '', isSecret: false },
				{ key: 'DB_PASSWORD', value: '', isSecret: false },
				{ key: 'APP_KEY', value: '', isSecret: true },
				{ key: 'EXTERNAL_API_KEY', value: '', isSecret: true },
				{ key: 'EXISTING', value: 'keep-me', isSecret: false },
			],
		});
		expect(result.filled).toBe(4);
		expect(result.preserved).toBe(1);
		expect(result.skipped).toBe(1);
		expect(result.variables.map(({ value }) => value)).toEqual([
			'https://demo.ghostdeploy.com',
			'false',
			'database-secret',
			expect.stringMatching(/^base64:/),
			'',
			'keep-me',
		]);
		expect(result.variables[2]?.isSecret).toBe(true);
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
