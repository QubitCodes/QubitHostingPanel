import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { FRAMEWORK_ACCEPTANCE_CASES } from '@config/frameworkAcceptanceCatalog';
import { frameworkDefinition } from '@config/frameworkCatalog';
import { resolveDeploymentContract } from '@services/applications/deploymentRecipeService';

interface FixtureResult {
	code: string;
	checks: number;
	status: 'passed';
}

/** Throws with fixture-specific context when an acceptance invariant fails. */
function assertFixture(
	condition: unknown,
	code: string,
	message: string,
): asserts condition {
	if (!condition) throw new Error(`${code}: ${message}`);
}

/** Reads a fixture file without allowing the catalogue to escape the repository. */
function fixtureFile(directory: string, file: string): string {
	const repositoryRoot = resolve(process.cwd());
	const target = resolve(repositoryRoot, directory, file);
	assertFixture(
		target.startsWith(`${repositoryRoot}\\`) || target.startsWith(`${repositoryRoot}/`),
		directory,
		'fixture path escapes the repository root.',
	);
	return target;
}

/** Validates every maintained fixture and its provider-independent contract. */
function verifyFixtures(): FixtureResult[] {
	const codes = new Set<string>();
	const directories = new Set<string>();
	return FRAMEWORK_ACCEPTANCE_CASES.map((entry) => {
		assertFixture(!codes.has(entry.code), entry.code, 'framework code is duplicated.');
		assertFixture(
			!directories.has(entry.fixtureDirectory),
			entry.code,
			'fixture directory is duplicated.',
		);
		codes.add(entry.code);
		directories.add(entry.fixtureDirectory);

		const framework = frameworkDefinition(entry.code);
		assertFixture(framework, entry.code, 'framework is not advertised.');
		assertFixture(
			framework.language === entry.stack,
			entry.code,
			`catalogue language ${framework.language} does not match ${entry.stack}.`,
		);
		assertFixture(
			framework.defaultPort === entry.port,
			entry.code,
			`catalogue port ${framework.defaultPort} does not match ${entry.port}.`,
		);
		assertFixture(
			JSON.stringify(framework.persistentDirectories ?? []) ===
				JSON.stringify(entry.persistenceDirectories),
			entry.code,
			'persistent directories differ from the framework catalogue.',
		);

		for (const file of entry.requiredFiles)
			assertFixture(
				existsSync(fixtureFile(entry.fixtureDirectory, file)),
				entry.code,
				`required file ${file} is missing.`,
			);

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
		const blocking = contract.checks.filter(({ status }) => status === 'error');
		assertFixture(
			blocking.length === 0,
			entry.code,
			`deployment contract is blocked: ${blocking.map(({ message }) => message).join(' ')}`,
		);

		const fixtureText = entry.requiredFiles
			.map((file) => readFileSync(fixtureFile(entry.fixtureDirectory, file), 'utf8'))
			.join('\n')
			.toLowerCase();
		assertFixture(
			fixtureText.includes(entry.code === 'nextjs' ? 'next' : entry.code),
			entry.code,
			'fixture does not contain its framework marker.',
		);

		return {
			code: entry.code,
			checks: entry.requiredFiles.length + contract.checks.length + 4,
			status: 'passed',
		};
	});
}

const results = verifyFixtures();
for (const result of results)
	console.log(`${result.code}: ${result.status} (${result.checks} checks)`);
console.log(`Verified ${results.length} maintained framework fixtures.`);
