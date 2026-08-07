export interface ProviderConnectionResult {
	connected: boolean;
	provider: string;
}

export interface ProviderResource {
	id: string;
	kind: 'application' | 'database' | 'server' | 'service';
	name: string;
	status?: string;
}

export interface ProviderUsage {
	code: string;
	measuredAt: Date;
	value: number;
}

export interface ProviderJob {
	id: string;
	publicUrl?: string;
	status: ProviderJobStatus;
}

export type ProviderJobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface ProvisionApplicationInput {
	autoDeployEnabled?: boolean;
	baseDirectory?: string;
	buildCommand?: string;
	buildPack?: 'dockerfile' | 'nixpacks' | 'static';
	databaseEnvironment?: Array<{
		key: string;
		scope?: 'build' | 'both' | 'runtime';
		value: string;
	}>;
	environmentVariables?: Array<{
		key: string;
		value: string;
		scope: 'runtime' | 'build' | 'both';
	}>;
	deploymentEnvironment?: 'development' | 'testing' | 'staging' | 'production';
	domains?: string[];
	healthCheckPath?: string;
	installCommand?: string;
	name: string;
	persistentStorages?: Array<{ mountPath: string; name: string }>;
	publishDirectory?: string;
	runtimeImage?: {
		port: number;
		repository: string;
		tag: string;
	};
	source?: { branch: string; githubAppUuid?: string; repository: string };
	startCommand?: string;
	workspaceId: string;
}

export interface ProviderScheduledTaskInput {
	command: string;
	enabled: boolean;
	frequency: string;
	name: string;
	timeout: number;
}

export interface ProviderScheduledTask extends ProviderScheduledTaskInput {
	uuid: string;
}

export interface ProviderScheduledTaskExecution {
	createdAt?: string;
	duration?: number | null;
	finishedAt?: string | null;
	message?: string | null;
	startedAt?: string | null;
	status: 'failed' | 'running' | 'success';
	uuid: string;
}
export interface ProviderDeployment {
	diagnostic?:
		| import('@services/applications/deploymentDiagnosticService').DeploymentDiagnostic
		| null;
	commitMessage?: string | null;
	commitSha?: string | null;
	createdAt?: string | null;
	finishedAt?: string | null;
	id: string;
	logs?: string | null;
	logSections?: import('@services/applications/deploymentLogParserService').DeploymentLogSections;
	status: string;
	trigger: 'api' | 'manual' | 'webhook';
}

export interface ProviderApplicationState {
	status: string;
}

/** Provider boundary keeping Coolify-specific contracts out of commercial logic. */
export interface HostingProvider {
	controlApplication(
		applicationId: string,
		action: 'redeploy' | 'restart' | 'start' | 'stop',
	): Promise<{ deploymentId?: string }>;
	deleteApplication(applicationId: string): Promise<void>;
	listApplicationDeployments(
		applicationId: string,
		take?: number,
	): Promise<readonly ProviderDeployment[]>;
	getApplicationState(applicationId: string): Promise<ProviderApplicationState>;
	getApplicationDeployment(deploymentId: string): Promise<ProviderDeployment>;
	updateApplicationSettings(
		applicationId: string,
		input: { autoDeployEnabled?: boolean; visibility?: 'private' | 'public' },
	): Promise<void>;
	validateConnection(): Promise<ProviderConnectionResult>;
	listResources(): Promise<readonly ProviderResource[]>;
	getUsage(): Promise<readonly ProviderUsage[]>;
	provisionApplication(input: ProvisionApplicationInput): Promise<ProviderJob>;
	getDeployment(jobId: string): Promise<ProviderJobStatus>;
	getApplicationLogs(applicationId: string, lines?: number): Promise<string>;
	updateApplicationDomains(
		applicationId: string,
		domains: string[],
	): Promise<void>;
	createApplicationScheduledTask(
		applicationId: string,
		input: ProviderScheduledTaskInput,
	): Promise<ProviderScheduledTask>;
	updateApplicationScheduledTask(
		applicationId: string,
		taskId: string,
		input: ProviderScheduledTaskInput,
	): Promise<ProviderScheduledTask>;
	deleteApplicationScheduledTask(
		applicationId: string,
		taskId: string,
	): Promise<void>;
	listApplicationScheduledTaskExecutions(
		applicationId: string,
		taskId: string,
	): Promise<readonly ProviderScheduledTaskExecution[]>;
}
