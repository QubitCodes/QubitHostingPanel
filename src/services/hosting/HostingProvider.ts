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
	name: string;
	runtimeImage?: {
		port: number;
		repository: string;
		tag: string;
	};
	workspaceId: string;
}

/** Provider boundary keeping Coolify-specific contracts out of commercial logic. */
export interface HostingProvider {
	validateConnection(): Promise<ProviderConnectionResult>;
	listResources(): Promise<readonly ProviderResource[]>;
	getUsage(): Promise<readonly ProviderUsage[]>;
	provisionApplication(input: ProvisionApplicationInput): Promise<ProviderJob>;
	getDeployment(jobId: string): Promise<ProviderJobStatus>;
}
