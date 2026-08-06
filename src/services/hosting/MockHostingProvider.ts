import type {
	HostingProvider,
	ProviderConnectionResult,
	ProviderDeployment,
	ProviderJob,
	ProviderJobStatus,
	ProviderResource,
	ProviderUsage,
	ProvisionApplicationInput,
	ProviderScheduledTask,
	ProviderScheduledTaskExecution,
	ProviderScheduledTaskInput,
} from '@services/hosting/HostingProvider';

/** Deterministic local provider used until the read-only Coolify staging phase. */
export class MockHostingProvider implements HostingProvider {
	public async controlApplication(_applicationId: string, action: 'redeploy' | 'restart' | 'start' | 'stop'): Promise<{ deploymentId?: string }> { return { deploymentId: `mock-${action}` }; }
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
	public async deleteApplication(): Promise<void> {}
	public async listApplicationDeployments(): Promise<readonly ProviderDeployment[]> { return []; }
	public async updateApplicationSettings(): Promise<void> {}

	public async updateApplicationDomains(): Promise<void> { return Promise.resolve(); }
	public async createApplicationScheduledTask(_applicationId: string, input: ProviderScheduledTaskInput): Promise<ProviderScheduledTask> { return { ...input, uuid: crypto.randomUUID() }; }
	public async updateApplicationScheduledTask(_applicationId: string, taskId: string, input: ProviderScheduledTaskInput): Promise<ProviderScheduledTask> { return { ...input, uuid: taskId }; }
	public async deleteApplicationScheduledTask(): Promise<void> { return Promise.resolve(); }
	public async listApplicationScheduledTaskExecutions(): Promise<readonly ProviderScheduledTaskExecution[]> { return []; }
}
