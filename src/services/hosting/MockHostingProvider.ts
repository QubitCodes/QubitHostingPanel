import type {
	HostingProvider,
	ProviderConnectionResult,
	ProviderJob,
	ProviderJobStatus,
	ProviderResource,
	ProviderUsage,
	ProvisionApplicationInput
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
		return Promise.resolve({ id: `mock-app-${input.workspaceId}`, publicUrl: `https://${input.name}.mock.invalid`, status: 'succeeded' });
	}

	public async getDeployment(jobId: string): Promise<ProviderJobStatus> {
		void jobId;
		return Promise.resolve('succeeded');
	}

	public async getApplicationLogs(): Promise<string> { return 'Mock application is running.'; }

	public async updateApplicationDomains(): Promise<void> { return Promise.resolve(); }
}
