import { describe, expect, it, vi } from 'vitest';

import {
	ApplicationProviderStatusCache,
	applicationStatusMap,
} from '@services/applications/applicationProviderStatusService';

describe('application provider status snapshots', () => {
	it('maps only application resources that expose a provider status', () => {
		expect(
			applicationStatusMap([
				{ id: 'app-1', kind: 'application', name: 'One', status: 'running:healthy' },
				{ id: 'db-1', kind: 'database', name: 'Database', status: 'running' },
				{ id: 'app-2', kind: 'application', name: 'Two' },
			]),
		).toEqual(new Map([['app-1', 'running:healthy']]));
	});

	it('shares one provider inventory call inside the cache window', async () => {
		const cache = new ApplicationProviderStatusCache(5_000);
		const load = vi.fn(async () => [
			{ id: 'app-1', kind: 'application' as const, name: 'One', status: 'exited:unhealthy' },
		]);
		const first = await cache.get(load, 1_000);
		const second = await cache.get(load, 2_000);
		expect(first.get('app-1')).toBe('exited:unhealthy');
		expect(second).toBe(first);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('retains the last successful snapshot during a provider failure', async () => {
		const cache = new ApplicationProviderStatusCache(1);
		await cache.get(async () => [
			{ id: 'app-1', kind: 'application' as const, name: 'One', status: 'running:healthy' },
		], 1_000);
		const stale = await cache.get(async () => {
			throw new Error('Provider unavailable');
		}, Number.MAX_SAFE_INTEGER);
		expect(stale.get('app-1')).toBe('running:healthy');
	});
});
