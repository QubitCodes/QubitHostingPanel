import { resolveNs } from 'node:dns/promises';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { applicationBuilds, applicationDomains, customers, dnsImportRuns, dnsRecords, dnsZones, domainOwnerships, workspaceMemberships, workspaces } from '@db/schema';
import type { CreateDnsRecordInput, ImportDnsInput, UpdateDnsRecordInput } from '@schemas/dns';
import { recordAuditLog } from '@services/auditLogService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { createCloudflareRecord, createCloudflareZone, deleteCloudflareRecord } from '@services/domains/cloudflareDnsProvider';
import { ensureManagedApplicationDns, importProviderDns, parseZoneFile, scanPublicDns } from '@services/domains/dnsManagementService';
import type { RequestMetadata } from '@utils/request';

async function ownedDomain(request: Request, workspacePublicId: number, ownershipId: string, metadata: RequestMetadata) {
	const actor = await authenticateSession(request, metadata);
	const [record] = await db.select({ ownershipId: domainOwnerships.id, hostname: domainOwnerships.hostname, ownershipStatus: domainOwnerships.status, workspaceId: workspaces.id }).from(domainOwnerships)
		.innerJoin(workspaces, and(eq(workspaces.id, domainOwnerships.workspaceId), eq(workspaces.publicId, workspacePublicId), isNull(workspaces.deletedAt)))
		.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.workspaceId, workspaces.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
		.innerJoin(customers, and(eq(customers.id, workspaceMemberships.customerId), eq(customers.userId, actor.userId), isNull(customers.deletedAt)))
		.where(and(eq(domainOwnerships.id, ownershipId), isNull(domainOwnerships.deletedAt))).limit(1);
	if (!record) throw new Error('Domain not found.');
	return { ...record, actorUserId: actor.userId };
}

async function zoneFor(domain: Awaited<ReturnType<typeof ownedDomain>>, create = false) {
	let [zone] = await db.select().from(dnsZones).where(and(eq(dnsZones.ownershipId, domain.ownershipId), isNull(dnsZones.deletedAt))).limit(1);
	if (!zone && create) [zone] = await db.insert(dnsZones).values({ workspaceId: domain.workspaceId, ownershipId: domain.ownershipId, hostname: domain.hostname }).returning();
	return zone;
}

/** Owns DNS draft import, authoritative provisioning, record CRUD, and delegation refresh. */
export class DnsController {
	public static async show(request: Request, workspaceId: number, ownershipId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const domain = await ownedDomain(request, workspaceId, ownershipId, metadata); const zone = await zoneFor(domain, true); if (!zone) throw new Error('Unable to create DNS draft.');
			const [records, subdomains] = await Promise.all([
				db.select().from(dnsRecords).where(and(eq(dnsRecords.zoneId, zone.id), isNull(dnsRecords.deletedAt))).orderBy(asc(dnsRecords.name), asc(dnsRecords.type)),
				db.select({ applicationId: applicationBuilds.id, applicationName: applicationBuilds.metadata, domainId: applicationDomains.id, hostname: applicationDomains.hostname, status: applicationDomains.status, tlsStatus: applicationDomains.tlsStatus }).from(applicationDomains).innerJoin(applicationBuilds, and(eq(applicationBuilds.id, applicationDomains.applicationBuildId), eq(applicationBuilds.workspaceId, domain.workspaceId), isNull(applicationBuilds.deletedAt))).where(and(isNull(applicationDomains.deletedAt))),
			]);
			return resp.success('DNS configuration retrieved.', { domain: { id: domain.ownershipId, hostname: domain.hostname, status: domain.ownershipStatus }, zone, records, subdomains: subdomains.filter((item) => item.hostname.endsWith(`.${domain.hostname}`)).map(({ applicationName, ...item }) => ({ ...item, applicationName: String(applicationName?.name ?? 'Application') })) });
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to load DNS configuration.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
	}

	public static async import(request: Request, workspaceId: number, ownershipId: string, input: ImportDnsInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const domain = await ownedDomain(request, workspaceId, ownershipId, metadata); const zone = await zoneFor(domain, true); if (!zone) throw new Error('Unable to create DNS draft.');
			const result = input.source === 'public_scan' ? await scanPublicDns(domain.hostname) : input.source === 'zone_file' ? parseZoneFile(input.zoneFile!, domain.hostname) : await importProviderDns(input.source, domain.hostname, input.apiToken);
			await db.transaction(async (transaction) => {
				for (const record of result.records) await transaction.insert(dnsRecords).values({ zoneId: zone.id, name: record.name, type: record.type, content: record.content, ttl: record.ttl, priority: record.priority, proxied: record.proxied, source: record.source }).onConflictDoNothing();
				await transaction.insert(dnsImportRuns).values({ zoneId: zone.id, source: input.source === 'public_scan' || input.source === 'zone_file' ? 'manual' : input.source, status: 'succeeded', discoveredCount: result.records.length, warnings: result.warnings });
				await transaction.update(dnsZones).set({ lastImportedAt: new Date(), updatedAt: new Date() }).where(eq(dnsZones.id, zone.id));
			});
			await recordAuditLog({ action: 'dns.imported', actorUserId: domain.actorUserId, resourceId: zone.id, resourceType: 'dns_zone', metadata: { hostname: domain.hostname, source: input.source, count: result.records.length }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('DNS records captured into the review draft.', result, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to import DNS records.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}

	public static async provision(request: Request, workspaceId: number, ownershipId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const domain = await ownedDomain(request, workspaceId, ownershipId, metadata); if (domain.ownershipStatus !== 'verified') throw new Error('Verify domain ownership before DNS provisioning.');
			const zone = await zoneFor(domain, true); if (!zone) throw new Error('Unable to create DNS draft.');
			let providerZoneId = zone.providerZoneId; let nameservers = zone.nameservers;
			if (!providerZoneId) { const created = await createCloudflareZone(domain.hostname); providerZoneId = created.id; nameservers = created.nameservers; }
			const connectedSubdomains = await db.select({ id: applicationDomains.id, hostname: applicationDomains.hostname }).from(applicationDomains).where(and(eq(applicationDomains.type, 'custom'), eq(applicationDomains.status, 'verified'), isNull(applicationDomains.deletedAt)));
			for (const connected of connectedSubdomains.filter((item) => item.hostname.endsWith(`.${domain.hostname}`))) await ensureManagedApplicationDns(domain.workspaceId, connected.id, connected.hostname);
			const records = await db.select().from(dnsRecords).where(and(eq(dnsRecords.zoneId, zone.id), eq(dnsRecords.isEnabled, true), isNull(dnsRecords.deletedAt)));
			for (const record of records) if (!record.providerRecordId && record.type !== 'NS') { const name = record.name === '@' ? domain.hostname : record.name.endsWith(`.${domain.hostname}`) ? record.name : `${record.name}.${domain.hostname}`; const providerRecordId = await createCloudflareRecord(providerZoneId, { ...record, name }); await db.update(dnsRecords).set({ providerRecordId, updatedAt: new Date() }).where(eq(dnsRecords.id, record.id)); }
			await db.update(dnsZones).set({ provider: 'cloudflare', providerZoneId, nameservers, status: 'pending_delegation', lastSynchronizedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(dnsZones.id, zone.id));
			return resp.success('DNS zone provisioned. Change the registrar nameservers, then refresh delegation.', { nameservers }, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to provision DNS.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}

	public static async refresh(request: Request, workspaceId: number, ownershipId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const domain = await ownedDomain(request, workspaceId, ownershipId, metadata); const zone = await zoneFor(domain); if (!zone?.nameservers.length) throw new Error('Provision the DNS zone first.');
			const observed = (await resolveNs(domain.hostname)).map((value) => value.toLowerCase().replace(/\.$/, '')).sort(); const expected = zone.nameservers.map((value) => value.toLowerCase().replace(/\.$/, '')).sort(); const active = expected.every((value) => observed.includes(value));
			await db.update(dnsZones).set({ status: active ? 'active' : 'pending_delegation', delegationVerifiedAt: active ? new Date() : null, lastError: active ? null : `Observed nameservers: ${observed.join(', ') || 'none'}`, updatedAt: new Date() }).where(eq(dnsZones.id, zone.id));
			return resp.success(active ? 'Nameserver delegation is active.' : 'Nameserver delegation is still pending.', { active, expected, observed }, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to refresh delegation.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}

	public static async createRecord(request: Request, workspaceId: number, ownershipId: string, input: CreateDnsRecordInput, metadata: RequestMetadata): Promise<Response> {
		try { const domain = await ownedDomain(request, workspaceId, ownershipId, metadata); const zone = await zoneFor(domain, true); if (!zone) throw new Error('Unable to create DNS draft.'); const [record] = await db.insert(dnsRecords).values({ zoneId: zone.id, ...input, source: 'user' }).returning(); return resp.success('DNS record created.', record, resp.codes.CREATED, undefined, 201); }
		catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to create DNS record.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}

	public static async mutateRecord(request: Request, workspaceId: number, ownershipId: string, recordId: string, input: UpdateDnsRecordInput | undefined, metadata: RequestMetadata): Promise<Response> {
		try {
			const domain = await ownedDomain(request, workspaceId, ownershipId, metadata); const zone = await zoneFor(domain); if (!zone) throw new Error('DNS zone not found.');
			const [record] = await db.select().from(dnsRecords).where(and(eq(dnsRecords.id, recordId), eq(dnsRecords.zoneId, zone.id), isNull(dnsRecords.deletedAt))).limit(1); if (!record) throw new Error('DNS record not found.');
			if (record.source === 'platform_managed') throw new Error('Platform-managed application records cannot be edited manually.');
			if (!input) { if (zone.providerZoneId && record.providerRecordId) await deleteCloudflareRecord(zone.providerZoneId, record.providerRecordId); await db.update(dnsRecords).set({ deletedAt: new Date(), deleteReason: 'Removed by customer.', isEnabled: false, updatedAt: new Date() }).where(eq(dnsRecords.id, record.id)); return resp.success('DNS record removed.', null, resp.codes.UPDATED); }
			if (zone.providerZoneId && record.providerRecordId) await deleteCloudflareRecord(zone.providerZoneId, record.providerRecordId);
			await db.update(dnsRecords).set({ ...input, providerRecordId: null, updatedAt: new Date() }).where(eq(dnsRecords.id, record.id)); return resp.success('DNS record updated. Provision again to publish changes.', null, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to update DNS record.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}
}
