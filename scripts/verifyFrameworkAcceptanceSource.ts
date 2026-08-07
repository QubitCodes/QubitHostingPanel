import { FRAMEWORK_ACCEPTANCE_CASES } from '@config/frameworkAcceptanceCatalog';
import { analyzeApplicationSource } from '@services/applications/sourceDetectionService';

/** Verifies that the pushed fixture repository produces the expected suggestions. */
async function main(): Promise<void> {
	const repository = process.env.FRAMEWORK_ACCEPTANCE_REPOSITORY_URL;
	const branch = process.env.FRAMEWORK_ACCEPTANCE_BRANCH ?? 'main';
	if (!repository)
		throw new Error('FRAMEWORK_ACCEPTANCE_REPOSITORY_URL is required.');

	const analysis = await analyzeApplicationSource(
		repository,
		branch,
		process.env.FRAMEWORK_ACCEPTANCE_GITHUB_TOKEN,
	);
	for (const entry of FRAMEWORK_ACCEPTANCE_CASES) {
		const candidate = analysis.candidates.find(
			(item) =>
				item.framework === entry.code &&
				item.projectDirectory === entry.fixtureDirectory,
		);
		if (!candidate)
			throw new Error(
				`${entry.code}: pushed source did not produce the expected candidate at ${entry.fixtureDirectory}.`,
			);
		const blocking = candidate.deploymentContract?.checks.filter(
			({ status }) => status === 'error',
		);
		if (!candidate.deploymentContract || blocking?.length)
			throw new Error(
				`${entry.code}: pushed source produced a blocked deployment contract.`,
			);
		console.log(
			`${entry.code}: detected at ${candidate.projectDirectory} with ${candidate.packageManager ?? 'provider'} tooling.`,
		);
	}
	console.log(
		`Verified ${FRAMEWORK_ACCEPTANCE_CASES.length} pushed framework candidates on ${branch}.`,
	);
}

await main();
