import { randomUUID } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { applicationBuilds, applicationDomains, customers, workspaceMemberships, workspaceResources, workspaces } from '@db/schema';
import type { CreateApplicationDomainRequest, UpdateApplicationDomainRequest } from '@schemas/application';
import { recordAuditLog } from '@services/auditLogService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';
import type { RequestMetadata } from '@utils/request';

async function ownedApplication(request: Request, workspacePublicId: number, applicationId: string, metadata: RequestMetadata) {
	const actor = await authenticateSession(request, metadata);
	const [application] = await db.select({ id: applicationBuilds.id, resourceProviderId: workspaceResources.providerResourceId }).from(customers)
		.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
		.innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, workspacePublicId), isNull(workspaces.deletedAt)))
		.innerJoin(applicationBuilds, and(eq(applicationBuilds.workspaceId, workspaces.id), eq(applicationBuilds.id, applicationId), isNull(applicationBuilds.deletedAt)))
		.leftJoin(workspaceResources, eq(workspaceResources.id, applicationBuilds.resourceId))
		.where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt))).limit(1);
	if (!application) throw new Error('Application not found.');
	return { ...application, actorUserId: actor.userId };
}

async function synchronize(applicationId: string, providerId?: string | null): Promise<void> {
	if (!providerId) return;
	const domains = (await db.select({ hostname: applicationDomains.hostname }).from(applicationDomains).where(and(eq(applicationDomains.applicationBuildId, applicationId), eq(applicationDomains.status, 'verified'), eq(applicationDomains.isEnabled, true), isNull(applicationDomains.deletedAt)))).map(({ hostname }) => hostname);
	await (await hostingProvider()).updateApplicationDomains(providerId, domains);
}

export class ApplicationDomainController {
	public static async index(request: Request, workspaceId: number, applicationId: string, metadata: RequestMetadata): Promise<Response> { try { await ownedApplication(request, workspaceId, applicationId, metadata); return resp.success('Application domains retrieved.', await db.select().from(applicationDomains).where(and(eq(applicationDomains.applicationBuildId, applicationId), isNull(applicationDomains.deletedAt)))); } catch { return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); } }

	public static async create(request: Request, workspaceId: number, applicationId: string, input: CreateApplicationDomainRequest, metadata: RequestMetadata): Promise<Response> {
		try { const application = await ownedApplication(request, workspaceId, applicationId, metadata); const [domain] = await db.insert(applicationDomains).values({ applicationBuildId: applicationId, hostname: input.hostname, type: 'custom', status: 'pending', isEnabled: false, verificationToken: randomUUID() }).returning(); await recordAuditLog({ action: 'application_domain.created', actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, metadata: { hostname: input.hostname }, resourceId: domain?.id, resourceType: 'application_domain', userAgent: metadata.userAgent }); return resp.success('Custom domain added. Create the displayed TXT record before verification.', domain, resp.codes.CREATED, undefined, 201); } catch (error) { return resp.failure(error instanceof Error && /unique/i.test(error.message) ? 'Domain is already assigned.' : 'Unable to add domain.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409); }
	}

	public static async verify(request: Request, workspaceId: number, applicationId: string, domainId: string, metadata: RequestMetadata): Promise<Response> {
		try { const application = await ownedApplication(request, workspaceId, applicationId, metadata); const [domain] = await db.select().from(applicationDomains).where(and(eq(applicationDomains.id, domainId), eq(applicationDomains.applicationBuildId, applicationId), eq(applicationDomains.type, 'custom'), isNull(applicationDomains.deletedAt))).limit(1); if (!domain?.verificationToken) throw new Error('Domain not found.'); const records = (await resolveTxt(`_qubit-verification.${domain.hostname}`)).flat(); if (!records.includes(domain.verificationToken)) return resp.failure('Verification TXT record was not found.', resp.codes.INVALID_INPUT_DATA, undefined, { expectedHost: `_qubit-verification.${domain.hostname}`, expectedValue: domain.verificationToken }, undefined, 422); await db.update(applicationDomains).set({ status: 'verified', isEnabled: true, verifiedAt: new Date(), updatedAt: new Date() }).where(eq(applicationDomains.id, domain.id)); await synchronize(applicationId, application.resourceProviderId); return resp.success('Custom domain verified and enabled.', { hostname: domain.hostname }, resp.codes.UPDATED); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Domain verification failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}

	public static async update(request: Request, workspaceId: number, applicationId: string, domainId: string, input: UpdateApplicationDomainRequest, metadata: RequestMetadata): Promise<Response> {
		try { const application = await ownedApplication(request, workspaceId, applicationId, metadata); const [domain] = await db.select().from(applicationDomains).where(and(eq(applicationDomains.id, domainId), eq(applicationDomains.applicationBuildId, applicationId), isNull(applicationDomains.deletedAt))).limit(1); if (!domain) throw new Error('Domain not found.'); if (input.action === 'set_primary') { if (domain.status !== 'verified' || !domain.isEnabled) throw new Error('Only an enabled verified domain can be primary.'); await db.transaction(async (transaction) => { await transaction.update(applicationDomains).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(applicationDomains.applicationBuildId, applicationId), ne(applicationDomains.id, domainId))); await transaction.update(applicationDomains).set({ isPrimary: true, updatedAt: new Date() }).where(eq(applicationDomains.id, domainId)); }); } else { if (domain.type !== 'platform') throw new Error('Only the platform domain can be toggled.'); const enabled = input.enabled === true; let replacementPrimaryId: string | undefined; if (!enabled) { const [custom] = await db.select({ id: applicationDomains.id }).from(applicationDomains).where(and(eq(applicationDomains.applicationBuildId, applicationId), eq(applicationDomains.type, 'custom'), eq(applicationDomains.status, 'verified'), eq(applicationDomains.isEnabled, true), isNull(applicationDomains.deletedAt))).limit(1); if (!custom) throw new Error('Verify and enable a custom domain before disabling the platform domain.'); replacementPrimaryId = domain.isPrimary ? custom.id : undefined; } await db.transaction(async (transaction) => { await transaction.update(applicationDomains).set({ isEnabled: enabled, isPrimary: enabled ? domain.isPrimary : false, updatedAt: new Date() }).where(eq(applicationDomains.id, domainId)); if (replacementPrimaryId) await transaction.update(applicationDomains).set({ isPrimary: true, updatedAt: new Date() }).where(eq(applicationDomains.id, replacementPrimaryId)); }); } await synchronize(applicationId, application.resourceProviderId); await recordAuditLog({ action: `application_domain.${input.action}`, actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, metadata: { domainId, enabled: input.enabled }, resourceId: domainId, resourceType: 'application_domain', userAgent: metadata.userAgent }); return resp.success('Application domain updated.', null, resp.codes.UPDATED); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to update domain.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}
}
