import { describe, expect, it } from 'vitest';

import { createPlatformDeploymentSchema } from '@schemas/platformDeployment';
import {
	normalizePlatformDeploymentStatus,
	toPlatformDeploymentView,
} from '@services/operations/platformDeploymentService';

describe('platform deployment validation', () => {
	it('requires the exact production confirmation', () => {
		expect(
			createPlatformDeploymentSchema.safeParse({ confirmation: 'DEPLOY' }).success,
		).toBe(true);
		expect(
			createPlatformDeploymentSchema.safeParse({ confirmation: 'deploy' }).success,
		).toBe(false);
	});
});

describe('platform deployment provider status', () => {
	it.each([
		['queued', 'queued'],
		['in_progress', 'running'],
		['finished', 'succeeded'],
		['failed', 'failed'],
		['cancelled-by-user', 'cancelled'],
	] as const)('maps %s to %s', (providerStatus, expected) => {
		expect(normalizePlatformDeploymentStatus(providerStatus)).toBe(expected);
	});

	it('never exposes the fixed target or provider deployment identifier', () => {
		const view = toPlatformDeploymentView({
			commitMessage: null,
			commitSha: null,
			completedAt: null,
			createdAt: new Date('2026-08-08T00:00:00Z'),
			deleteReason: null,
			deletedAt: null,
			failureMessage: null,
			id: '00000000-0000-4000-8000-000000000001',
			lastPollError: null,
			logs: '',
			providerConnectionId: null,
			providerDeploymentId: 'provider-deployment-id',
			providerStatus: 'running',
			requestedByUserId: '00000000-0000-4000-8000-000000000002',
			startedAt: new Date('2026-08-08T00:00:00Z'),
			status: 'running',
			targetApplicationUuid: 'private-target',
			updatedAt: new Date('2026-08-08T00:00:00Z'),
		});
		expect(view).not.toHaveProperty('targetApplicationUuid');
		expect(view).not.toHaveProperty('providerDeploymentId');
	});
});
