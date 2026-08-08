import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	authorizeAdmin: vi.fn(),
	getPlatformDeployment: vi.fn(),
	listPlatformDeployments: vi.fn(),
	recordRequiredAdminAuditLog: vi.fn(),
	startPlatformDeployment: vi.fn(),
	toPlatformDeploymentView: vi.fn((value: unknown) => value),
}));

vi.mock('@services/authorization/adminAuthorizationService', () => ({
	authorizeAdmin: mocks.authorizeAdmin,
}));
vi.mock('@services/auditLogService', () => ({
	recordRequiredAdminAuditLog: mocks.recordRequiredAdminAuditLog,
}));
vi.mock('@services/operations/platformDeploymentService', () => ({
	getPlatformDeployment: mocks.getPlatformDeployment,
	listPlatformDeployments: mocks.listPlatformDeployments,
	startPlatformDeployment: mocks.startPlatformDeployment,
	toPlatformDeploymentView: mocks.toPlatformDeploymentView,
}));

import { PlatformDeploymentController } from '@controllers/PlatformDeploymentController';
import { getRequestMetadata } from '@utils/request';

const request = new Request('https://ghostdeploy.com/api/v1/operations/platform-deployments');
const metadata = getRequestMetadata(request);

describe('platform deployment authorization', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.recordRequiredAdminAuditLog.mockResolvedValue(undefined);
	});

	it('rejects an ordinary permitted administrator before reading deployments', async () => {
		mocks.authorizeAdmin.mockResolvedValue({
			isSuperAdmin: false,
			permissionCodes: new Set(['deployments.view']),
			sessionId: crypto.randomUUID(),
			userId: crypto.randomUUID(),
		});

		const response = await PlatformDeploymentController.index(request, metadata);

		expect(response.status).toBe(403);
		expect(mocks.listPlatformDeployments).not.toHaveBeenCalled();
	});

	it('allows the database-backed Super Admin and audits page access', async () => {
		mocks.authorizeAdmin.mockResolvedValue({
			isSuperAdmin: true,
			permissionCodes: new Set(),
			sessionId: crypto.randomUUID(),
			userId: crypto.randomUUID(),
		});
		mocks.listPlatformDeployments.mockResolvedValue([]);

		const response = await PlatformDeploymentController.index(request, metadata);

		expect(response.status).toBe(200);
		expect(mocks.listPlatformDeployments).toHaveBeenCalledOnce();
		expect(mocks.recordRequiredAdminAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'admin.platform_deployments.view',
				resourceType: 'platform_deployment',
			}),
		);
	});
});
