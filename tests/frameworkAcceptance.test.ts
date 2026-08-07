import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FRAMEWORK_ACCEPTANCE_CASES } from '@config/frameworkAcceptanceCatalog';
import { frameworkDefinition } from '@config/frameworkCatalog';
import { resolveDeploymentContract } from '@services/applications/deploymentRecipeService';

describe('framework acceptance fixtures', () => {
	it('keeps every first-batch fixture complete and contract-compatible', () => {
		expect(new Set(FRAMEWORK_ACCEPTANCE_CASES.map(({ code }) => code)).size).toBe(
			FRAMEWORK_ACCEPTANCE_CASES.length,
		);
		for (const entry of FRAMEWORK_ACCEPTANCE_CASES) {
			expect(frameworkDefinition(entry.code)?.language).toBe(entry.stack);
			for (const file of entry.requiredFiles)
				expect(existsSync(resolve(entry.fixtureDirectory, file))).toBe(true);
			const contract = resolveDeploymentContract({
				buildCommand: entry.buildCommand,
				framework: entry.code,
				installCommand: entry.installCommand,
				port: entry.port,
				projectDirectory: entry.fixtureDirectory,
				publishDirectory: entry.publishDirectory,
				stack: entry.stack,
				startCommand: entry.startCommand,
			});
			expect(contract.checks.some(({ status }) => status === 'error')).toBe(
				false,
			);
		}
	});
});
