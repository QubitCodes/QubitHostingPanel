import { describe, expect, it } from 'vitest';

import { parseDeploymentLogs } from '@services/applications/deploymentLogParserService';

describe('deployment log parser', () => {
	it('separates project build output from platform deployment activity', () => {
		const parsed = parseDeploymentLogs([
			'Starting deployment of example/repository:main.',
			"Cloning into '/artifacts/example'...",
			'#13 0.2 npm run build',
			'#13 4.8 Type error: Property id does not exist.',
			'Deployment failed. Removing the new version of your application.',
			'Gracefully shutting down build container: example',
		].join('\n'));
		expect(parsed.build).toContain('npm run build');
		expect(parsed.build).toContain('Type error');
		expect(parsed.deployment).toContain('Starting deployment');
		expect(parsed.deployment).toContain('Removing the new version');
		expect(parsed.raw).toContain('Gracefully shutting down');
	});
});
