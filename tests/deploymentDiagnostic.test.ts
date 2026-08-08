import { describe, expect, it } from 'vitest';

import { diagnoseDeploymentLogs } from '@services/applications/deploymentDiagnosticService';

describe('deployment diagnostics', () => {
	it('identifies a Nixpacks source encoding failure as platform-recoverable', () => {
		expect(
			diagnoseDeploymentLogs(
				'Error: Error reading resources/js/pages/campaigns.tsx\n\nCaused by:\n    stream did not contain valid UTF-8',
			),
		).toMatchObject({
			code: 'invalid-source-encoding',
			developerActionRequired: false,
			location: 'resources/js/pages/campaigns.tsx',
			owner: 'platform',
			title: 'Source encoding compatibility issue',
		});
	});
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
				'Failed to type check.\n./src/services/messaging/MessagingService.ts:182:29\nType error: Property id does not exist on type WhatsAppTemplateSubmission.',
			),
		).toMatchObject({
			code: 'typescript-check-failed',
			developerActionRequired: true,
			detail: 'Property id does not exist on type WhatsAppTemplateSubmission.',
			location: 'src/services/messaging/MessagingService.ts:182:29',
			owner: 'project',
			phase: 'build',
			title: 'Project build failed',
		});
	});
});
