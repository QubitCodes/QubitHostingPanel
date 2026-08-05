import { describe, expect, it } from 'vitest';

import {
	FRAMEWORK_CATALOG,
	frameworkDefinition,
	frameworksForLanguage,
} from '@config/frameworkCatalog';
import { createRuntimeImageSchema } from '@schemas/runtimeImage';

describe('framework catalogue', () => {
	it('contains every advertised server framework and CMS', () => {
		const codes = new Set<string>(FRAMEWORK_CATALOG.map(({ code }) => code));
		for (const code of [
			'react-router',
			'nextjs',
			'laravel',
			'wordpress',
			'cakephp',
			'symfony',
			'django',
			'rails',
		])
			expect(codes.has(code), `${code} is missing`).toBe(true);
	});

	it('keeps WordPress on PHP/MySQL with persistent content', () => {
		expect(frameworkDefinition('wordpress')).toMatchObject({
			databaseEngines: ['mysql'],
			language: 'php',
			persistentDirectories: ['wp-content'],
			schedulerPreset: 'wordpress',
		});
	});

	it('exposes Rails only under the Ruby runtime', () => {
		expect(frameworksForLanguage('ruby').map(({ code }) => code)).toEqual([
			'rails',
		]);
		expect(
			createRuntimeImageSchema.safeParse({
				code: 'ruby-3.4',
				defaultPort: 3000,
				isDefault: true,
				language: 'ruby',
				registry: 'ghcr.io',
				repository: 'qubitcodes/runtime-ruby',
				status: 'active',
				tag: '3.4.10',
				version: '3.4.10',
			}).success,
		).toBe(true);
	});
});
