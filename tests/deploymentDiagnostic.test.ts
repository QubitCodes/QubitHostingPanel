import { describe, expect, it } from 'vitest';

import { diagnoseDeploymentLogs } from '@services/applications/deploymentDiagnosticService';

describe('deployment diagnostics', () => {
	it('identifies stale npm lockfiles as an automatically recoverable configuration failure', () => {
		expect(
			diagnoseDeploymentLogs(
				'RUN npm ci\nnpm ci can only install packages when package.json and package-lock.json are not in sync. Missing: package@1',
			),
		).toMatchObject({
			code: 'npm-lock-out-of-sync',
			developerActionRequired: false,
		});
	});

	it('identifies source type failures as requiring a repository fix', () => {
		expect(
			diagnoseDeploymentLogs(
				'Failed to type check. Type error: Property id does not exist.',
			),
		).toMatchObject({
			code: 'typescript-check-failed',
			developerActionRequired: true,
		});
	});
});
