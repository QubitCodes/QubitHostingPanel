import { frameworkDefinition } from '@config/frameworkCatalog';

export interface ApplicationReleasePolicy {
	migrateOnDeploy: boolean;
	migrationCommand: string | null;
	migrationTimeoutSeconds: number;
	runSeederOnDeploy: boolean;
	seederCommand: string | null;
	seederTimeoutSeconds: number;
}

/** Supplies conservative framework defaults without inventing commands for generic stacks. */
export function defaultApplicationReleasePolicy(framework?: string | null): ApplicationReleasePolicy {
	const release = frameworkDefinition(framework)?.release;
	return {
		migrateOnDeploy: Boolean(release?.migrationCommand),
		migrationCommand: release?.migrationCommand ?? null,
		migrationTimeoutSeconds: 900,
		runSeederOnDeploy: false,
		seederCommand: release?.seederCommand ?? null,
		seederTimeoutSeconds: 900,
	};
}

/** Quotes a customer-owned command for one bounded shell invocation. */
function shellArgument(value: string): string {
	return `'${value.replaceAll("'", String.raw`'"'"'`)}'`;
}

/** Builds the provider post-release hook. Migration always precedes the optional seeder. */
export function applicationPostDeploymentCommand(policy: ApplicationReleasePolicy): string | undefined {
	const commands: string[] = [];
	if (policy.migrateOnDeploy && policy.migrationCommand)
		commands.push(`timeout ${policy.migrationTimeoutSeconds}s sh -c ${shellArgument(policy.migrationCommand)}`);
	if (policy.runSeederOnDeploy && policy.seederCommand)
		commands.push(`timeout ${policy.seederTimeoutSeconds}s sh -c ${shellArgument(policy.seederCommand)}`);
	return commands.length ? commands.join(' && ') : undefined;
}
