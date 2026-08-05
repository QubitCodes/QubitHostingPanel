import { dnsProviderCredential } from '@services/domains/dnsProviderCredentialService';

interface CloudflareEnvelope<T> {
	errors?: Array<{ message?: string }>;
	result?: T;
	success: boolean;
}

interface CloudflareRecordInput {
	content: string;
	name: string;
	priority?: number | null;
	proxied: boolean;
	ttl: number;
	type: string;
}

function cloudflareRecordPayload(record: CloudflareRecordInput) {
	return {
		content: record.content,
		name: record.name,
		...(record.priority == null ? {} : { priority: record.priority }),
		proxied: record.proxied,
		ttl: record.ttl,
		type: record.type,
	};
}

async function cloudflare<T>(path: string, init?: RequestInit): Promise<T> {
	const credential = await dnsProviderCredential('cloudflare');
	if (!credential)
		throw new Error('Cloudflare DNS API token is not configured.');
	const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		...init,
		headers: {
			authorization: `Bearer ${credential.token}`,
			'content-type': 'application/json',
			...init?.headers,
		},
		signal: AbortSignal.timeout(20_000),
	});
	const body = (await response.json()) as CloudflareEnvelope<T>;
	if (!response.ok || !body.success || body.result === undefined)
		throw new Error(
			body.errors?.[0]?.message ??
				`Cloudflare returned HTTP ${response.status}.`,
		);
	return body.result;
}

/** Creates an authoritative Cloudflare zone and returns its assigned nameservers. */
export async function createCloudflareZone(
	hostname: string,
): Promise<{ id: string; nameservers: string[] }> {
	const accountId = (await dnsProviderCredential('cloudflare'))
		?.accountIdentifier;
	if (!accountId)
		throw new Error('Cloudflare DNS account ID is not configured.');
	const zone = await cloudflare<{ id: string; name_servers?: string[] }>(
		'/zones',
		{
			method: 'POST',
			body: JSON.stringify({
				account: { id: accountId },
				name: hostname,
				type: 'full',
			}),
		},
	);
	return { id: zone.id, nameservers: zone.name_servers ?? [] };
}

/** Creates one record and preserves the provider identifier for safe deletion. */
export async function createCloudflareRecord(
	zoneId: string,
	record: CloudflareRecordInput,
): Promise<string> {
	const result = await cloudflare<{ id: string }>(
		`/zones/${zoneId}/dns_records`,
		{ method: 'POST', body: JSON.stringify(cloudflareRecordPayload(record)) },
	);
	return result.id;
}

/** Updates one provider record in place so DNS changes do not create a deletion gap. */
export async function updateCloudflareRecord(
	zoneId: string,
	recordId: string,
	record: CloudflareRecordInput,
): Promise<void> {
	await cloudflare(`/zones/${zoneId}/dns_records/${recordId}`, {
		method: 'PUT',
		body: JSON.stringify(cloudflareRecordPayload(record)),
	});
}

export async function deleteCloudflareRecord(
	zoneId: string,
	recordId: string,
): Promise<void> {
	await cloudflare(`/zones/${zoneId}/dns_records/${recordId}`, {
		method: 'DELETE',
	});
}
