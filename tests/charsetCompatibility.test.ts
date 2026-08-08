import { describe, expect, it } from 'vitest';

import { parseCharsetCompatibilityFixes } from '@services/applications/charsetCompatibilityService';

describe('charset compatibility evidence', () => {
	it('extracts safe conversion metadata without source contents', () => {
		const fixes = parseCharsetCompatibilityFixes(
			'GHOSTDEPLOY_CHARSET_FIX {"path":"resources/app.tsx","from":"cp1252","to":"utf-8","confidence":0.95,"originalSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","convertedSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',
		);
		expect(fixes).toEqual([
			expect.objectContaining({
				confidence: 0.95,
				from: 'cp1252',
				path: 'resources/app.tsx',
				to: 'utf-8',
			}),
		]);
	});

	it('ignores malformed or incomplete provider markers', () => {
		expect(parseCharsetCompatibilityFixes('GHOSTDEPLOY_CHARSET_FIX {"path":"secret.ts"}')).toEqual([]);
	});
});
