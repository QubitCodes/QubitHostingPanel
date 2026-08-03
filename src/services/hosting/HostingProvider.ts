export interface ProviderConnectionResult {
	connected: boolean;
	provider: string;
}

export interface ProviderResource {
	id: string;
	kind: 'application' | 'database' | 'server' | 'service';
	name: string;
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
	baseDirectory?: string;
	buildCommand?: string;
	buildPack?: 'dockerfile' | 'nixpacks' | 'static';
	databaseEnvironment?: Array<{ key: string; value: string }>;
	domain?: string;
	installCommand?: string;
	name: string;
	publishDirectory?: string;
	runtimeImage?: {
		port: number;
		repository: string;
		tag: string;
	};
	source?: { branch: string; repository: string };
	startCommand?: string;
	workspaceId: string;
}

/** Provider boundary keeping Coolify-specific contracts out of commercial logic. */
export interface HostingProvider {
	validateConnection(): Promise<ProviderConnectionResult>;
	listResources(): Promise<readonly ProviderResource[]>;
	getUsage(): Promise<readonly ProviderUsage[]>;
	provisionApplication(input: ProvisionApplicationInput): Promise<ProviderJob>;
	getDeployment(jobId: string): Promise<ProviderJobStatus>;
	getApplicationLogs(applicationId: string, lines?: number): Promise<string>;
}
