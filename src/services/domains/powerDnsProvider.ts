import { getEnvironment } from '@config/env';
import { dnsProviderCredential } from '@services/domains/dnsProviderCredentialService';

interface PowerDnsRecordInput {
	content: string;
	name: string;
	priority?: number | null;
	ttl: number;
	type: string;
}

interface PowerDnsRrset {
	comments?: Array<{ account: string; content: string; modified_at: number }>;
	name: string;
	records: Array<{ content: string; disabled: boolean }>;
	ttl: number;
	type: string;
}

interface PowerDnsZone { id: string; name: string; rrsets: PowerDnsRrset[] }
interface RecordIdentity { content: string; name: string; type: string }

function absoluteName(name: string): string { return `${name.replace(/\.$/, '')}.`; }
function encodedIdentity(identity: RecordIdentity): string { return Buffer.from(JSON.stringify(identity), 'utf8').toString('base64url'); }
function decodedIdentity(value: string): RecordIdentity { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as RecordIdentity; }

function powerDnsContent(record: Pick<PowerDnsRecordInput, 'content' | 'priority' | 'type'>): string {
	if (record.type === 'TXT') return JSON.stringify(record.content);
	if (record.type === 'MX') return `${record.priority ?? 0} ${absoluteName(record.content)}`;
	if (record.type === 'SRV') return `${record.priority ?? 0} ${record.content.replace(/([^\s.])$/, '$1.')}`;
	if (['CNAME', 'NS'].includes(record.type)) return absoluteName(record.content);
	return record.content;
}

async function powerDns<T>(path: string, init?: RequestInit): Promise<T> {
	const credential = await dnsProviderCredential('powerdns');
	if (!credential?.accountIdentifier) throw new Error('PowerDNS API URL is not configured.');
	const response = await fetch(`${credential.accountIdentifier.replace(/\/$/, '')}/api/v1/servers/localhost${path}`, {
		...init,
		headers: { accept: 'application/json', 'content-type': 'application/json', 'x-api-key': credential.token, ...init?.headers },
		signal: AbortSignal.timeout(20_000),
	});
	if (!response.ok) { const message = await response.text(); throw new Error(`PowerDNS returned HTTP ${response.status}${message ? `: ${message.slice(0, 300)}` : '.'}`); }
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

async function zone(zoneId: string): Promise<PowerDnsZone> { return powerDns<PowerDnsZone>(`/zones/${encodeURIComponent(zoneId)}`); }

async function replaceRrset(zoneId: string, name: string, type: string, ttl: number, contents: string[]): Promise<void> {
	await powerDns(`/zones/${encodeURIComponent(zoneId)}`, { method: 'PATCH', body: JSON.stringify({ rrsets: [{ changetype: contents.length ? 'REPLACE' : 'DELETE', name, type, ttl, records: contents.map((content) => ({ content, disabled: false })) }] }) });
}

/** Creates a native authoritative zone using the configured branded nameservers. */
export async function createPowerDnsZone(hostname: string): Promise<{ id: string; nameservers: string[] }> {
	const nameservers = getEnvironment().POWERDNS_NAMESERVERS.split(',').map((value) => value.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean);
	if (nameservers.length < 2) throw new Error('At least two PowerDNS nameserver hostnames are required.');
	const name = absoluteName(hostname);
	try { const existing = await zone(name); return { id: existing.id || name, nameservers }; } catch (error) { if (!(error instanceof Error) || !error.message.includes('HTTP 404')) throw error; }
	const created = await powerDns<PowerDnsZone>('/zones', { method: 'POST', body: JSON.stringify({ kind: 'Native', name, nameservers: nameservers.map(absoluteName) }) });
	return { id: created.id || name, nameservers };
}

/** Adds one value while preserving all other values in the PowerDNS RRset. */
export async function createPowerDnsRecord(zoneId: string, record: PowerDnsRecordInput): Promise<string> {
	const current = await zone(zoneId); const name = absoluteName(record.name); const content = powerDnsContent(record); const rrset = current.rrsets.find((item) => item.name === name && item.type === record.type);
	const contents = [...new Set([...(rrset?.records.filter((item) => !item.disabled).map((item) => item.content) ?? []), content])];
	await replaceRrset(zoneId, name, record.type, record.ttl, contents);
	return encodedIdentity({ content, name, type: record.type });
}

/** Replaces one tracked value without removing sibling records in the same RRset. */
export async function updatePowerDnsRecord(zoneId: string, recordId: string, record: PowerDnsRecordInput): Promise<string> {
	const previous = decodedIdentity(recordId); const current = await zone(zoneId); const nextName = absoluteName(record.name); const nextContent = powerDnsContent(record);
	const previousSet = current.rrsets.find((item) => item.name === previous.name && item.type === previous.type);
	const remaining = previousSet?.records.filter((item) => !item.disabled && item.content !== previous.content).map((item) => item.content) ?? [];
	if (previous.name !== nextName || previous.type !== record.type) await replaceRrset(zoneId, previous.name, previous.type, previousSet?.ttl ?? record.ttl, remaining);
	const nextSet = previous.name === nextName && previous.type === record.type ? remaining : (await zone(zoneId)).rrsets.find((item) => item.name === nextName && item.type === record.type)?.records.filter((item) => !item.disabled).map((item) => item.content) ?? [];
	await replaceRrset(zoneId, nextName, record.type, record.ttl, [...new Set([...nextSet, nextContent])]);
	return encodedIdentity({ content: nextContent, name: nextName, type: record.type });
}

export async function deletePowerDnsRecord(zoneId: string, recordId: string): Promise<void> {
	const identity = decodedIdentity(recordId); const current = await zone(zoneId); const rrset = current.rrsets.find((item) => item.name === identity.name && item.type === identity.type);
	const remaining = rrset?.records.filter((item) => !item.disabled && item.content !== identity.content).map((item) => item.content) ?? [];
	await replaceRrset(zoneId, identity.name, identity.type, rrset?.ttl ?? 300, remaining);
}
