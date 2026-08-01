import type {
	HostingProvider,
	ProviderConnectionResult,
	ProviderJob,
	ProviderJobStatus,
	ProviderResource,
	ProviderUsage,
	ProvisionApplicationInput,
	ProvisionDatabaseInput
} from '@services/hosting/HostingProvider';

/** Deterministic local provider used until the read-only Coolify staging phase. */
export class MockHostingProvider implements HostingProvider {
	public async validateConnection(): Promise<ProviderConnectionResult> {
		return Promise.resolve({ connected: true, provider: 'mock' });
	}

	public async listResources(): Promise<readonly ProviderResource[]> {
		return Promise.resolve([]);
	}

	public async getUsage(): Promise<readonly ProviderUsage[]> {
		return Promise.resolve([]);
	}

	public async provisionApplication(input: ProvisionApplicationInput): Promise<ProviderJob> {
		void input;
		return Promise.resolve({ id: 'mock-application-job', status: 'succeeded' });
	}

	public async provisionDatabase(input: ProvisionDatabaseInput): Promise<ProviderJob> {
		void input;
		return Promise.resolve({ id: 'mock-database-job', status: 'succeeded' });
	}

	public async getDeployment(jobId: string): Promise<ProviderJobStatus> {
		void jobId;
		return Promise.resolve('succeeded');
	}
}
