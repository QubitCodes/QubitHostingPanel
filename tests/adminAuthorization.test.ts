import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authenticateSession: vi.fn(),
	getEffectivePermissionCodes: vi.fn(),
	select: vi.fn(),
}));

vi.mock('@db/client', () => ({ db: { select: mocks.select } }));
vi.mock('@services/auth/authenticatedSessionService', () => ({
	authenticateSession: mocks.authenticateSession,
}));
vi.mock('@services/authorization/permissionService', () => ({
	getEffectivePermissionCodes: mocks.getEffectivePermissionCodes,
}));

import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';

describe('administrator authorization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.authenticateSession.mockResolvedValue({
			context: 'admin',
			sessionId: 'session-id',
			userId: 'user-id',
		});
	});

	it('immediately authorizes an active Super Admin assignment', async () => {
		const limit = vi.fn().mockResolvedValue([{ id: 'assignment-id' }]);
		mocks.select.mockReturnValue({
			from: () => ({
				innerJoin: () => ({
					where: () => ({ limit }),
				}),
			}),
		});

		const result = await authorizeAdmin(
			new Request('http://localhost/api/v1/admins'),
			'admins.view',
			{ sessionClient: { clientHints: {} } },
		);

		expect(result.isSuperAdmin).toBe(true);
		expect(result.permissionCodes.size).toBe(0);
		expect(mocks.getEffectivePermissionCodes).not.toHaveBeenCalled();
		expect(mocks.select).toHaveBeenCalledTimes(1);
	});
});

