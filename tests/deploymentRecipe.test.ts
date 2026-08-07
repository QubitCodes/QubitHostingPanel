import { describe, expect, it } from 'vitest';

import {
	FRAMEWORK_CATALOG,
	frameworkDefinition,
} from '@config/frameworkCatalog';
import {
	buildSafeInstallCommand,
	DEPLOYMENT_RECIPE_VERSION,
	frameworkEnvironmentDefaults,
	resolveDeploymentContract,
} from '@services/applications/deploymentRecipeService';

describe('deployment recipes', () => {
	it('provides a versioned contract for every advertised framework', () => {
		for (const framework of FRAMEWORK_CATALOG) {
			const outputDirectory = frameworkDefinition(
				framework.code,
			)?.outputDirectory;
			const contract = resolveDeploymentContract({
				buildCommand: outputDirectory ? 'build' : undefined,
				framework: framework.code,
				port: framework.defaultPort,
				projectDirectory: '/',
				publishDirectory: outputDirectory,
				stack: framework.language,
				startCommand:
					framework.language === 'node' ||
					framework.language === 'python' ||
					framework.language === 'ruby'
						? 'start'
						: undefined,
			});
			expect(contract.recipeVersion).toBe(DEPLOYMENT_RECIPE_VERSION);
			expect(contract.checks.every(({ status }) => status !== 'error')).toBe(
				true,
			);
		}
	});

	it('installs Node build tooling even when NODE_ENV is production', () => {
		expect(buildSafeInstallCommand('npm ci', 'npm run build')).toBe(
			'npm ci --include=dev || npm install --include=dev',
		);
		expect(buildSafeInstallCommand('npm ci', undefined)).toBe('npm ci');
	});

	it('blocks a selected server framework when no start command can be proven', () => {
		const contract = resolveDeploymentContract({
			framework: 'express',
			port: 3000,
			projectDirectory: '/',
			stack: 'node',
		});
		expect(contract.checks).toContainEqual(
			expect.objectContaining({ code: 'start-command', status: 'error' }),
		);
	});

	it('gives Laravel safe first-boot runtime defaults', () => {
		expect(frameworkEnvironmentDefaults('laravel')).toEqual([
			{ key: 'SESSION_DRIVER', value: 'file', scope: 'runtime' },
			{ key: 'CACHE_STORE', value: 'file', scope: 'runtime' },
			{ key: 'QUEUE_CONNECTION', value: 'sync', scope: 'runtime' },
		]);
		expect(frameworkEnvironmentDefaults('express')).toEqual([]);
	});
});
