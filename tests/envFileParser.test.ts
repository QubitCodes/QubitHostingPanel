import { describe, expect, it } from 'vitest';

import { isLikelySecretEnvKey, parseEnvFile } from '@root/app/utils/envFileParser';

describe('env file parser', () => {
	it('parses common dotenv syntax without expanding references', () => {
		const parsed = parseEnvFile('# comment\nexport app_name="Ghost Deploy"\nTOKEN=abc # hidden\nEMPTY=\nURL="https://example.com?a=1#hash"');
		expect(parsed.entries).toEqual([
			{ key: 'APP_NAME', line: 2, value: 'Ghost Deploy' },
			{ key: 'TOKEN', line: 3, value: 'abc' },
			{ key: 'EMPTY', line: 4, value: '' },
			{ key: 'URL', line: 5, value: 'https://example.com?a=1#hash' },
		]);
		expect(parsed.invalidLines).toEqual([]);
	});

	it('supports multiline quoted values and reports invalid lines', () => {
		const parsed = parseEnvFile("PRIVATE_KEY='line one\nline two'\nBROKEN LINE\n1INVALID=value");
		expect(parsed.entries[0]?.value).toBe('line one\nline two');
		expect(parsed.invalidLines).toEqual([
			{ line: 3, reason: 'Missing equals sign.' },
			{ line: 4, reason: 'Invalid variable name.' },
		]);
	});

	it('keeps the final duplicate value and detects likely secrets', () => {
		const parsed = parseEnvFile('MODE=first\nMODE=second');
		expect(parsed.entries).toEqual([{ key: 'MODE', line: 2, value: 'second' }]);
		expect(parsed.duplicateKeys).toEqual(['MODE']);
		expect(isLikelySecretEnvKey('DATABASE_URL')).toBe(true);
		expect(isLikelySecretEnvKey('APP_NAME')).toBe(false);
	});
});
