import { describe, expect, it } from 'vitest';

import { diagnoseDeploymentLogs } from '@services/applications/deploymentDiagnosticService';
import { sanitizeCustomerDeploymentLog } from '@services/applications/deploymentLogSanitizerService';

describe('customer deployment logs', () => {
	it('redacts secrets and translates provider implementation terms', () => {
		const output = sanitizeCustomerDeploymentLog('Coolify Generating nixpacks configuration\nDATABASE_PASSWORD=hunter2\npostgresql://ghost:secret@db:5432/app');
		expect(output).not.toContain('hunter2');
		expect(output).not.toContain('secret@');
		expect(output).not.toMatch(/coolify|nixpacks/i);
		expect(output).toContain('Ghost Deploy');
		expect(output).toContain('[redacted]');
	});

	it('explains migration failures as a release-stage project error', () => {
		expect(diagnoseDeploymentLogs('php artisan migrate --force\nSQLSTATE error\nexit code 1')).toMatchObject({
			code: 'database-migration-failed',
			phase: 'deployment',
		});
	});
});
