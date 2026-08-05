import { resolve4, resolve6, resolveCaa, resolveCname, resolveMx, resolveNs, resolveSrv, resolveTxt } from 'node:dns/promises';

import type { CreateDnsRecordInput } from '@schemas/dns';
import { and, eq, isNull } from 'drizzle-orm';
import { getDomain } from 'tldts';
import { db } from '@db/client';
import { dnsRecords, dnsZones, domainOwnerships, platformSettings } from '@db/schema';
import { createAuthoritativeRecord, deleteAuthoritativeRecord, type AuthoritativeDnsProvider } from '@services/domains/authoritativeDnsProvider';
import { dnsProviderCredential } from '@services/domains/dnsProviderCredentialService';

export interface DiscoveredDnsRecord extends CreateDnsRecordInput { source: 'discovered' | 'imported' }

/** Best-effort credential-free scan. DNS cannot enumerate arbitrary owner names. */
export async function scanPublicDns(hostname: string): Promise<{ records: DiscoveredDnsRecord[]; warnings: string[] }> {
	const records: DiscoveredDnsRecord[] = [];
	const add = (name: string, type: CreateDnsRecordInput['type'], content: string, priority?: number) => records.push({ name, type, content, ttl: 300, proxied: false, ...(priority === undefined ? {} : { priority }), source: 'discovered' });
	const names = ['', 'www', 'mail', 'ftp', 'autodiscover', '_dmarc'];
	for (const label of names) {
		const fqdn = label ? `${label}.${hostname}` : hostname;
		for (const [type, resolver] of [['A', resolve4], ['AAAA', resolve6], ['CNAME', resolveCname]] as const) try { for (const value of await resolver(fqdn)) add(label || '@', type, value); } catch { /* Missing public record is expected. */ }
		try { for (const values of await resolveTxt(fqdn)) add(label || '@', 'TXT', values.join('')); } catch { /* Missing TXT is expected. */ }
	}
	try { for (const value of await resolveMx(hostname)) add('@', 'MX', value.exchange, value.priority); } catch { /* Optional. */ }
	try { for (const value of await resolveNs(hostname)) add('@', 'NS', value); } catch { /* Optional. */ }
	try { for (const value of await resolveCaa(hostname)) add('@', 'CAA', `${value.critical} ${'issue' in value ? 'issue' : 'iodef'} "${'issue' in value ? value.issue : value.iodef}"`); } catch { /* Optional. */ }
	for (const service of ['_sip._tcp', '_sip._udp', '_submission._tcp']) try { for (const value of await resolveSrv(`${service}.${hostname}`)) add(service, 'SRV', `${value.weight} ${value.port} ${value.name}`, value.priority); } catch { /* Optional. */ }
	return { records: unique(records), warnings: ['Public DNS scanning cannot discover arbitrary hostnames or hidden provider records. Review the imported draft before changing nameservers.'] };
}

/** Parses the common BIND record form while rejecting directives and unsupported records. */
export function parseZoneFile(zoneFile: string, hostname: string): { records: DiscoveredDnsRecord[]; warnings: string[] } {
	const records: DiscoveredDnsRecord[] = []; const warnings: string[] = [];
	for (const [index, raw] of zoneFile.split(/\r?\n/).entries()) {
		const line = raw.replace(/;.*$/, '').trim(); if (!line || line.startsWith('$ORIGIN') || line.startsWith('$TTL')) continue;
		const match = line.match(/^(\S+)\s+(?:(\d+)\s+)?(?:IN\s+)?(A|AAAA|CAA|CNAME|MX|NS|SRV|TXT)\s+(.+)$/i);
		if (!match) { warnings.push(`Line ${index + 1} was not imported.`); continue; }
		const [, rawName, rawTtl, rawType, rawContent] = match; const type = rawType!.toUpperCase() as CreateDnsRecordInput['type'];
		const relativeName = rawName === '@' || rawName === `${hostname}.` ? '@' : rawName!.replace(/\.$/, '').replace(new RegExp(`\\.${hostname.replace(/\./g, '\\.')}$$`, 'i'), '');
		let content = rawContent!.trim().replace(/^"|"$/g, ''); let priority: number | undefined;
		if (type === 'MX' || type === 'SRV') { const parts = content.split(/\s+/); priority = Number(parts.shift()); content = parts.join(' '); }
		records.push({ name: relativeName.toLowerCase(), type, content, ttl: rawTtl ? Number(rawTtl) : 300, proxied: false, ...(Number.isFinite(priority) ? { priority } : {}), source: 'imported' });
	}
	return { records: unique(records), warnings };
}

/** Imports a complete zone through an authenticated registrar/DNS API. Tokens are used in memory only. */
export async function importProviderDns(provider: 'godaddy' | 'hostinger', hostname: string, suppliedToken?: string): Promise<{ records: DiscoveredDnsRecord[]; warnings: string[] }> {
	const token = suppliedToken ?? (await dnsProviderCredential(provider))?.token;
	if (!token) throw new Error(`${provider} credentials are not configured.`);
	const url = provider === 'godaddy' ? `https://api.godaddy.com/v3/domains/zones/${encodeURIComponent(hostname)}/dns-records` : `https://developers.hostinger.com/api/dns/v1/zones/${encodeURIComponent(hostname)}`;
	const response = await fetch(url, { headers: { accept: 'application/json', authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
	if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}.`);
	const payload = await response.json() as unknown;
	const rows = Array.isArray(payload) ? payload : typeof payload === 'object' && payload ? ((payload as Record<string, unknown>).data ?? (payload as Record<string, unknown>).records) : [];
	if (!Array.isArray(rows)) throw new Error(`${provider} returned an unsupported DNS response.`);
	const records = rows.flatMap((row): DiscoveredDnsRecord[] => {
		if (typeof row !== 'object' || !row) return []; const value = row as Record<string, unknown>; const type = String(value.type ?? '').toUpperCase();
		if (!['A', 'AAAA', 'CAA', 'CNAME', 'MX', 'NS', 'SRV', 'TXT'].includes(type)) return [];
		return [{ name: String(value.name ?? value.host ?? '@').toLowerCase(), type: type as CreateDnsRecordInput['type'], content: String(value.data ?? value.address ?? value.content ?? ''), ttl: Number(value.ttl ?? 300), priority: value.priority == null ? undefined : Number(value.priority), proxied: false, source: 'imported' }];
	});
	return { records: unique(records), warnings: [] };
}

function unique(records: DiscoveredDnsRecord[]): DiscoveredDnsRecord[] {
	return [...new Map(records.filter((record) => record.content).map((record) => [`${record.name}|${record.type}|${record.content}`, record])).values()];
}

/** Adds explicit application address records unless an enabled wildcard already covers the hostname. */
export async function ensureManagedApplicationDns(workspaceId: string, applicationDomainId: string, hostname: string): Promise<void> {
	const root = getDomain(hostname, { allowPrivateDomains: true }); if (!root || root === hostname) return;
	const [zone] = await db.select({ id: dnsZones.id, provider: dnsZones.provider, providerZoneId: dnsZones.providerZoneId }).from(dnsZones).innerJoin(domainOwnerships, and(eq(domainOwnerships.id, dnsZones.ownershipId), eq(domainOwnerships.hostname, root), eq(domainOwnerships.workspaceId, workspaceId), eq(domainOwnerships.status, 'verified'), isNull(domainOwnerships.deletedAt))).where(isNull(dnsZones.deletedAt)).limit(1);
	if (!zone) return;
	const relative = hostname.slice(0, -(root.length + 1));
	const [wildcard] = await db.select({ id: dnsRecords.id }).from(dnsRecords).where(and(eq(dnsRecords.zoneId, zone.id), eq(dnsRecords.name, '*'), eq(dnsRecords.type, 'A'), eq(dnsRecords.isEnabled, true), isNull(dnsRecords.deletedAt))).limit(1);
	if (wildcard) return;
	const [settings] = await db.select({ ingressIpv4: platformSettings.ingressIpv4, ingressIpv6: platformSettings.ingressIpv6 }).from(platformSettings).where(and(eq(platformSettings.key, 'default'), isNull(platformSettings.deletedAt))).limit(1);
	for (const [type, content] of [['A', settings?.ingressIpv4], ['AAAA', settings?.ingressIpv6]] as const) if (content) {
		let providerRecordId: string | undefined; if (zone.providerZoneId) providerRecordId = await createAuthoritativeRecord(zone.provider as AuthoritativeDnsProvider, zone.providerZoneId, { name: hostname, type, content, ttl: 300, proxied: false });
		await db.insert(dnsRecords).values({ zoneId: zone.id, applicationDomainId, name: relative, type, content, ttl: 300, proxied: false, source: 'platform_managed', providerRecordId }).onConflictDoNothing();
	}
}

/** Deletes only records created for one application-domain binding. */
export async function removeManagedApplicationDns(applicationDomainId: string): Promise<void> {
	const records = await db.select({ id: dnsRecords.id, provider: dnsZones.provider, providerRecordId: dnsRecords.providerRecordId, providerZoneId: dnsZones.providerZoneId }).from(dnsRecords).innerJoin(dnsZones, eq(dnsZones.id, dnsRecords.zoneId)).where(and(eq(dnsRecords.applicationDomainId, applicationDomainId), eq(dnsRecords.source, 'platform_managed'), isNull(dnsRecords.deletedAt)));
	for (const record of records) { if (record.providerZoneId && record.providerRecordId) await deleteAuthoritativeRecord(record.provider as AuthoritativeDnsProvider, record.providerZoneId, record.providerRecordId); await db.update(dnsRecords).set({ deletedAt: new Date(), deleteReason: 'Application subdomain removed.', isEnabled: false, updatedAt: new Date() }).where(eq(dnsRecords.id, record.id)); }
}
