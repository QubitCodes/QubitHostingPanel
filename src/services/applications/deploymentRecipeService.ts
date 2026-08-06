import {
	frameworkDefinition,
	type RuntimeLanguage,
} from '@config/frameworkCatalog';

export const DEPLOYMENT_RECIPE_VERSION = '2026.08.1';

export type DeploymentServiceType = 'cms' | 'static' | 'web';
export type DeploymentCheckStatus = 'error' | 'pass' | 'warning';

export interface DeploymentCheck {
	code: string;
	message: string;
	status: DeploymentCheckStatus;
}

export interface DeploymentContract {
	buildCommand?: string;
	checks: DeploymentCheck[];
	framework: string | null;
	healthCheckPath: string;
	installCommand?: string;
	port: number;
	projectDirectory: string;
	publishDirectory?: string;
	recipeVersion: string;
	serviceType: DeploymentServiceType;
	startCommand?: string;
}

interface DeploymentContractInput {
	buildCommand?: string;
	framework?: string | null;
	installCommand?: string;
	port: number;
	projectDirectory: string;
	publishDirectory?: string;
	stack: RuntimeLanguage;
	startCommand?: string;
}

const CMS_FRAMEWORKS = new Set(['wordpress']);

/** Ensures production-mode Node builds still install compiler and framework tooling. */
export function buildSafeInstallCommand(
	installCommand: string | undefined,
	buildCommand: string | undefined,
): string | undefined {
	if (!installCommand || !buildCommand) return installCommand;
	if (installCommand === 'npm ci')
		return 'npm ci --include=dev || npm install --include=dev';
	if (installCommand === 'npm install') return 'npm install --include=dev';
	return installCommand;
}

/** Produces the provider-independent contract that must be verified for every deployment. */
export function resolveDeploymentContract(
	input: DeploymentContractInput,
): DeploymentContract {
	const framework = frameworkDefinition(input.framework);
	const serviceType: DeploymentServiceType =
		input.stack === 'static'
			? 'static'
			: input.framework && CMS_FRAMEWORKS.has(input.framework)
				? 'cms'
				: 'web';
	const installCommand = buildSafeInstallCommand(
		input.installCommand,
		input.buildCommand,
	);
	const publishDirectory =
		input.publishDirectory || framework?.outputDirectory || undefined;
	const checks: DeploymentCheck[] = [
		{
			code: 'framework-runtime',
			message: framework
				? `${framework.label} matches the ${input.stack} runtime.`
				: `Generic ${input.stack} deployment uses advanced defaults.`,
			status: framework ? 'pass' : 'warning',
		},
		{
			code: 'project-directory',
			message: `Project directory is ${input.projectDirectory}.`,
			status: input.projectDirectory ? 'pass' : 'error',
		},
	];
	if (serviceType === 'static')
		checks.push({
			code: 'static-output',
			message: publishDirectory
				? `Static output will be served from ${publishDirectory}.`
				: 'Choose the directory produced by the build.',
			status: publishDirectory ? 'pass' : 'error',
		});
	if (serviceType === 'web' && input.stack !== 'php')
		checks.push({
			code: 'start-command',
			message: input.startCommand
				? `Start command is ${input.startCommand}.`
				: 'A start command could not be proven from the repository.',
			status: input.startCommand
				? 'pass'
				: input.framework
					? 'error'
					: 'warning',
		});
	checks.push({
		code: 'internal-port',
		message: `The application must listen on 0.0.0.0:${input.port}.`,
		status: input.port > 0 && input.port <= 65_535 ? 'pass' : 'error',
	});
	return {
		buildCommand: input.buildCommand,
		checks,
		framework: input.framework ?? null,
		healthCheckPath: '/',
		installCommand,
		port: input.port,
		projectDirectory: input.projectDirectory,
		publishDirectory,
		recipeVersion: DEPLOYMENT_RECIPE_VERSION,
		serviceType,
		startCommand: input.startCommand,
	};
}
