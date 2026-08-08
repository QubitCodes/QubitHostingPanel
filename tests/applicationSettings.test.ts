import { describe, expect, it } from 'vitest';

import { updateApplicationSettingsSchema } from '@schemas/applicationSettings';
import { applicationPostDeploymentCommand, defaultApplicationReleasePolicy } from '@services/applications/applicationReleaseSettingsService';

describe('application release settings', () => {
	it('enables a known framework migration without enabling its seeder', () => {
		expect(defaultApplicationReleasePolicy('laravel')).toEqual({
			migrateOnDeploy: true,
			migrationCommand: 'php artisan migrate --force --no-interaction',
			migrationTimeoutSeconds: 900,
			runSeederOnDeploy: false,
			seederCommand: 'php artisan db:seed --force --no-interaction',
			seederTimeoutSeconds: 900,
		});
		expect(defaultApplicationReleasePolicy('express').migrateOnDeploy).toBe(false);
	});

	it('runs migration before a deliberately enabled seeder', () => {
		const command = applicationPostDeploymentCommand({
			migrateOnDeploy: true,
			migrationCommand: 'php artisan migrate --force',
			migrationTimeoutSeconds: 300,
			runSeederOnDeploy: true,
			seederCommand: 'php artisan db:seed --force',
			seederTimeoutSeconds: 120,
		});
		expect(command).toContain("timeout 300s sh -c 'php artisan migrate --force'");
		expect(command).toContain("&& timeout 120s sh -c 'php artisan db:seed --force'");
	});

	it('rejects enabled release actions without commands and unsafe upload sizes', () => {
		const result = updateApplicationSettingsSchema.safeParse({
			comingSoonEnabled: false, comingSoonExpiresAt: null,
			maintenanceDuringDeployment: false, maintenanceEnabled: false, maintenanceExpiresAt: null,
			migrateOnDeploy: true, migrationCommand: null, migrationTimeoutSeconds: 900,
			publicErrorMode: 'message', returnErrors: true,
			runSeederOnDeploy: false, seederCommand: null, seederTimeoutSeconds: 900,
			uploadAllowedExtensions: [], uploadAllowedMimeTypes: [],
			uploadMaxFileSizeMb: 100, uploadMaxRequestSizeMb: 50, uploadTimeoutSeconds: 300,
		});
		expect(result.success).toBe(false);
	});
});
