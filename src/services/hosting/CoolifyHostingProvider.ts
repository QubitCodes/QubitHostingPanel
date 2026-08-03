import { getEnvironment } from '@config/env';
import type { HostingProvider, ProviderConnectionResult, ProviderJob, ProviderJobStatus, ProviderResource, ProviderUsage, ProvisionApplicationInput } from '@services/hosting/HostingProvider';

interface CoolifyApplication { fqdn?: string | null; name?: string; status?: string; uuid?: string }

/** Converts a configured wildcard URL or hostname into a bare DNS suffix. */
export function normalizeCoolifyWildcardDomain(domain: string): string {
	return domain.trim().replace(/^https?:\/\//i, '').replace(/^\*\./, '').replace(/\/+$/, '');
}

/** Least-privilege Coolify v4 REST adapter for starter workload provisioning. */
export class CoolifyHostingProvider implements HostingProvider {
	private readonly environment = getEnvironment();

	private async request<T>(path: string, init?: RequestInit): Promise<T> {
		if (!this.environment.COOLIFY_BASE_URL || !this.environment.COOLIFY_API_TOKEN) throw new Error('Coolify credentials are unavailable.');
		const response = await fetch(`${this.environment.COOLIFY_BASE_URL.replace(/\/$/, '')}/api/v1${path}`, { ...init, headers: { authorization: `Bearer ${this.environment.COOLIFY_API_TOKEN}`, accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers }, signal: AbortSignal.timeout(20_000) });
		const text = await response.text();
		let body: unknown = {};
		try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
		if (!response.ok) throw new Error(`Coolify ${response.status}: ${String((body as { message?: unknown }).message ?? 'request failed')}`);
		return body as T;
	}

	public async validateConnection(): Promise<ProviderConnectionResult> {
		await this.request<unknown[]>('/applications');
		return { connected: true, provider: 'coolify' };
	}

	public async listResources(): Promise<readonly ProviderResource[]> {
		const applications = await this.request<CoolifyApplication[]>('/applications');
		return applications.filter((item) => item.uuid).map((item) => ({ id: item.uuid!, kind: 'application' as const, name: item.name ?? item.uuid! }));
	}

	public async getUsage(): Promise<readonly ProviderUsage[]> { return []; }

	public async provisionApplication(input: ProvisionApplicationInput): Promise<ProviderJob> {
		if (!this.environment.COOLIFY_DEFAULT_PROJECT_UUID || !this.environment.COOLIFY_SERVER_UUID) throw new Error('Coolify placement is incomplete.');
		const wildcardDomain = this.environment.COOLIFY_WILDCARD_DOMAIN ? normalizeCoolifyWildcardDomain(this.environment.COOLIFY_WILDCARD_DOMAIN) : undefined;
		const body = await this.request<{ uuid: string }>('/applications/dockerimage', { method: 'POST', body: JSON.stringify({ project_uuid: this.environment.COOLIFY_DEFAULT_PROJECT_UUID, server_uuid: this.environment.COOLIFY_SERVER_UUID, environment_name: this.environment.COOLIFY_DEFAULT_ENVIRONMENT_NAME, destination_uuid: this.environment.COOLIFY_DESTINATION_UUID, docker_registry_image_name: input.runtimeImage?.repository ?? this.environment.COOLIFY_STARTER_IMAGE, docker_registry_image_tag: input.runtimeImage?.tag ?? this.environment.COOLIFY_STARTER_IMAGE_TAG, ports_exposes: this.environment.COOLIFY_STARTER_PORT, name: input.name, description: `Qubit workspace ${input.workspaceId}`, autogenerate_domain: !wildcardDomain, domains: wildcardDomain ? `https://${input.name}.${wildcardDomain}` : undefined, health_check_enabled: true, health_check_path: '/', health_check_port: this.environment.COOLIFY_STARTER_PORT, instant_deploy: true }) });
		return { id: body.uuid, status: 'pending' };
	}

	public async getDeployment(jobId: string): Promise<ProviderJobStatus> {
		const application = await this.request<CoolifyApplication>(`/applications/${encodeURIComponent(jobId)}`);
		const status = application.status?.toLowerCase() ?? '';
		if (status.includes('running')) return 'succeeded';
		if (status.includes('failed') || status.includes('exited')) return 'failed';
		return status.includes('building') || status.includes('starting') ? 'running' : 'pending';
	}
}
