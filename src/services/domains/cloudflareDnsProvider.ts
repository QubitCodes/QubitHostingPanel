import { getEnvironment } from '@config/env';

interface CloudflareEnvelope<T> { errors?: Array<{ message?: string }>; result?: T; success: boolean }

async function cloudflare<T>(path: string, init?: RequestInit): Promise<T> {
	const environment = getEnvironment();
	if (!environment.CLOUDFLARE_DNS_API_TOKEN) throw new Error('Cloudflare DNS API token is not configured.');
	const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { authorization: `Bearer ${environment.CLOUDFLARE_DNS_API_TOKEN}`, 'content-type': 'application/json', ...init?.headers }, signal: AbortSignal.timeout(20_000) });
	const body = await response.json() as CloudflareEnvelope<T>;
	if (!response.ok || !body.success || body.result === undefined) throw new Error(body.errors?.[0]?.message ?? `Cloudflare returned HTTP ${response.status}.`);
	return body.result;
}

/** Creates an authoritative Cloudflare zone and returns its assigned nameservers. */
export async function createCloudflareZone(hostname: string): Promise<{ id: string; nameservers: string[] }> {
	const accountId = getEnvironment().CLOUDFLARE_DNS_ACCOUNT_ID;
	if (!accountId) throw new Error('Cloudflare DNS account ID is not configured.');
	const zone = await cloudflare<{ id: string; name_servers?: string[] }>('/zones', { method: 'POST', body: JSON.stringify({ account: { id: accountId }, name: hostname, type: 'full' }) });
	return { id: zone.id, nameservers: zone.name_servers ?? [] };
}

/** Creates one record and preserves the provider identifier for safe deletion. */
export async function createCloudflareRecord(zoneId: string, record: { content: string; name: string; priority?: number | null; proxied: boolean; ttl: number; type: string }): Promise<string> {
	const result = await cloudflare<{ id: string }>(`/zones/${zoneId}/dns_records`, { method: 'POST', body: JSON.stringify(record) });
	return result.id;
}

export async function deleteCloudflareRecord(zoneId: string, recordId: string): Promise<void> {
	await cloudflare(`/zones/${zoneId}/dns_records/${recordId}`, { method: 'DELETE' });
}
