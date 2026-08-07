import { describe, expect, it } from 'vitest';

import {
	childRepositoryDirectories,
	normalizeRepositoryDirectory,
} from '@root/app/components/applications/repository-directory-browser';

describe('repository directory browser', () => {
	it('normalizes provider paths without changing the repository root', () => {
		expect(normalizeRepositoryDirectory('/')).toBe('/');
		expect(normalizeRepositoryDirectory('/apps/web/')).toBe('apps/web');
		expect(normalizeRepositoryDirectory('apps\\api')).toBe('apps/api');
	});

	it('shows only folders immediately inside the open directory', () => {
		const directories = ['/', 'apps', 'apps/api', 'apps/api/src', 'apps/web', 'docs'];
		expect(childRepositoryDirectories(directories, '/')).toEqual(['apps', 'docs']);
		expect(childRepositoryDirectories(directories, 'apps')).toEqual([
			'apps/api',
			'apps/web',
		]);
		expect(childRepositoryDirectories(directories, 'apps/api')).toEqual([
			'apps/api/src',
		]);
	});
});
