import { describe, expect, it } from 'vitest';

import { MockHostingProvider } from '@services/hosting/MockHostingProvider';

describe('MockHostingProvider', () => {
	it('provides a deterministic local connection', async () => {
		const provider = new MockHostingProvider();

		await expect(provider.validateConnection()).resolves.toEqual({
			connected: true,
			provider: 'mock'
		});
	});

	it('returns successful idempotent fixture jobs', async () => {
		const provider = new MockHostingProvider();

		await expect(provider.provisionApplication({
			name: 'example',
			workspaceId: '00000000-0000-0000-0000-000000000000'
		})).resolves.toMatchObject({ status: 'succeeded' });
	});
});
