import { describe, expect, it, vi } from 'vitest';

import { openCreatedApplication } from '@root/app/utils/applicationNavigation';

describe('created application navigation', () => {
	it('opens the detail route and refreshes the collection that backs the drawer', async () => {
		const calls: string[] = [];
		const navigate = vi.fn((path: string) => calls.push(`navigate:${path}`));
		const reload = vi.fn(async () => { calls.push('reload'); });

		await openCreatedApplication({ id: 'application-id', navigate, reload });

		expect(navigate).toHaveBeenCalledWith('/dashboard/applications/application-id', { replace: true });
		expect(reload).toHaveBeenCalledOnce();
		expect(calls).toEqual(['navigate:/dashboard/applications/application-id', 'reload']);
	});
});
