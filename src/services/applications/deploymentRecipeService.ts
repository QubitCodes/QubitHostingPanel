import {
	frameworkDefinition,
	type RuntimeLanguage,
} from '@config/frameworkCatalog';

export const DEPLOYMENT_RECIPE_VERSION = '2026.08.2';

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

export interface FrameworkEnvironmentDefault {
	key: string;
	scope: 'both' | 'build' | 'runtime';
	value: string;
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

const FRAMEWORK_START_COMMANDS: Readonly<Record<string, string>> = {
	laravel: 'php artisan serve --host=0.0.0.0 --port=$PORT',
	wordpress: 'php -S 0.0.0.0:$PORT',
};

const FRAMEWORK_ENVIRONMENT_DEFAULTS: Readonly<
	Record<string, readonly FrameworkEnvironmentDefault[]>
> = {
	laravel: [
		{ key: 'APP_MAINTENANCE_DRIVER', value: 'file', scope: 'runtime' },
		{ key: 'SESSION_DRIVER', value: 'file', scope: 'runtime' },
		{ key: 'CACHE_STORE', value: 'file', scope: 'runtime' },
		{ key: 'QUEUE_CONNECTION', value: 'sync', scope: 'runtime' },
		{ key: 'LOG_CHANNEL', value: 'stderr', scope: 'runtime' },
	],
};

/**
 * Returns conservative first-boot defaults. Customer variables are applied
 * afterward and therefore retain final authority over every value.
 */
export function frameworkEnvironmentDefaults(
	framework?: string | null,
): FrameworkEnvironmentDefault[] {
	return framework
		? [...(FRAMEWORK_ENVIRONMENT_DEFAULTS[framework] ?? [])]
		: [];
}

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
	const startCommand =
		input.startCommand ??
		(input.framework ? FRAMEWORK_START_COMMANDS[input.framework] : undefined);
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
			message: input.projectDirectory === '/' ? 'Repository root selected.' : `Project directory is ${input.projectDirectory}.`,
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
			message: startCommand
				? `Start command is ${startCommand}.`
				: 'A start command could not be proven from the repository.',
			status: startCommand
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
		healthCheckPath: input.framework === 'laravel' ? '/up' : '/',
		installCommand,
		port: input.port,
		projectDirectory: input.projectDirectory,
		publishDirectory,
		recipeVersion: DEPLOYMENT_RECIPE_VERSION,
		serviceType,
		startCommand,
	};
}
