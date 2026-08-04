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

/** Resolve an application only when it belongs to the authenticated customer's workspace. */
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

/** Read the provider hostname set, optionally projecting one pending mutation. */
async function enabledHostnames(applicationId: string, mutation?: { domainId: string; enabled?: boolean; remove?: boolean; verified?: boolean }): Promise<string[]> {
	const domains = await db.select({ hostname: applicationDomains.hostname, id: applicationDomains.id, isEnabled: applicationDomains.isEnabled, status: applicationDomains.status }).from(applicationDomains)
		.where(and(eq(applicationDomains.applicationBuildId, applicationId), isNull(applicationDomains.deletedAt)));
	return domains.filter((domain) => {
		if (domain.id !== mutation?.domainId) return domain.status === 'verified' && domain.isEnabled;
		if (mutation.remove) return false;
		return (mutation.verified ?? domain.status === 'verified') && (mutation.enabled ?? domain.isEnabled);
	}).map(({ hostname }) => hostname);
}

/** Apply a proposed hostname set before committing its matching database mutation. */
async function synchronize(providerId: string | null | undefined, hostnames: string[]): Promise<void> {
	if (!providerId) return;
	await (await hostingProvider()).updateApplicationDomains(providerId, hostnames);
}

/** Probe HTTPS without requiring a successful application response code. */
async function inspectTls(hostname: string): Promise<{ failureReason: string | null; status: 'active' | 'failed' }> {
	try {
		await fetch(`https://${hostname}`, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10_000) });
		return { failureReason: null, status: 'active' };
	} catch (error) {
		return { failureReason: error instanceof Error ? error.message.slice(0, 500) : 'TLS connection failed.', status: 'failed' };
	}
}

export class ApplicationDomainController {
	/** List active domain records for an owned application. */
	public static async index(request: Request, workspaceId: number, applicationId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			await ownedApplication(request, workspaceId, applicationId, metadata);
			return resp.success('Application domains retrieved.', await db.select().from(applicationDomains).where(and(eq(applicationDomains.applicationBuildId, applicationId), isNull(applicationDomains.deletedAt))));
		} catch {
			return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		}
	}

	/** Register a custom hostname pending customer DNS ownership verification. */
	public static async create(request: Request, workspaceId: number, applicationId: string, input: CreateApplicationDomainRequest, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const [domain] = await db.insert(applicationDomains).values({ applicationBuildId: applicationId, hostname: input.hostname, type: 'custom', status: 'pending', isEnabled: false, verificationToken: randomUUID() }).returning();
			await recordAuditLog({ action: 'application_domain.created', actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, metadata: { hostname: input.hostname }, resourceId: domain?.id, resourceType: 'application_domain', userAgent: metadata.userAgent });
			return resp.success('Custom domain added. Create the displayed TXT record before verification.', domain, resp.codes.CREATED, undefined, 201);
		} catch (error) {
			return resp.failure(error instanceof Error && /unique/i.test(error.message) ? 'Domain is already assigned.' : 'Unable to add domain.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409);
		}
	}

	/** Verify DNS ownership and attach the hostname to the provider before enabling it locally. */
	public static async verify(request: Request, workspaceId: number, applicationId: string, domainId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const [domain] = await db.select().from(applicationDomains).where(and(eq(applicationDomains.id, domainId), eq(applicationDomains.applicationBuildId, applicationId), eq(applicationDomains.type, 'custom'), isNull(applicationDomains.deletedAt))).limit(1);
			if (!domain?.verificationToken) throw new Error('Domain not found.');
			const records = (await resolveTxt(`_qubit-verification.${domain.hostname}`)).flat();
			if (!records.includes(domain.verificationToken)) return resp.failure('Verification TXT record was not found.', resp.codes.INVALID_INPUT_DATA, undefined, { expectedHost: `_qubit-verification.${domain.hostname}`, expectedValue: domain.verificationToken }, undefined, 422);
			await synchronize(application.resourceProviderId, await enabledHostnames(applicationId, { domainId, enabled: true, verified: true }));
			await db.update(applicationDomains).set({ status: 'verified', isEnabled: true, verifiedAt: new Date(), tlsStatus: 'provisioning', tlsFailureReason: null, updatedAt: new Date() }).where(eq(applicationDomains.id, domain.id));
			return resp.success('Custom domain verified and enabled. TLS provisioning has started.', { hostname: domain.hostname }, resp.codes.UPDATED);
		} catch (error) {
			return resp.failure(error instanceof Error ? error.message : 'Domain verification failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502);
		}
	}

	/** Change domain routing state or refresh its observed TLS state. */
	public static async update(request: Request, workspaceId: number, applicationId: string, domainId: string, input: UpdateApplicationDomainRequest, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const [domain] = await db.select().from(applicationDomains).where(and(eq(applicationDomains.id, domainId), eq(applicationDomains.applicationBuildId, applicationId), isNull(applicationDomains.deletedAt))).limit(1);
			if (!domain) throw new Error('Domain not found.');
			if (input.action === 'refresh_tls') {
				if (domain.status !== 'verified' || !domain.isEnabled) throw new Error('Only an enabled verified domain can be checked.');
				const tls = await inspectTls(domain.hostname);
				await db.update(applicationDomains).set({ tlsStatus: tls.status, tlsCheckedAt: new Date(), tlsFailureReason: tls.failureReason, updatedAt: new Date() }).where(eq(applicationDomains.id, domainId));
				return resp.success(tls.status === 'active' ? 'TLS is active.' : 'TLS is not ready.', tls, resp.codes.UPDATED);
			}
			if (input.action === 'set_primary') {
				if (domain.status !== 'verified' || !domain.isEnabled) throw new Error('Only an enabled verified domain can be primary.');
				await db.transaction(async (transaction) => {
					await transaction.update(applicationDomains).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(applicationDomains.applicationBuildId, applicationId), ne(applicationDomains.id, domainId)));
					await transaction.update(applicationDomains).set({ isPrimary: true, updatedAt: new Date() }).where(eq(applicationDomains.id, domainId));
				});
			} else {
				if (domain.type !== 'platform') throw new Error('Only the platform domain can be toggled.');
				const enabled = input.enabled === true;
				let replacementPrimaryId: string | undefined;
				if (!enabled) {
					const [custom] = await db.select({ id: applicationDomains.id }).from(applicationDomains).where(and(eq(applicationDomains.applicationBuildId, applicationId), eq(applicationDomains.type, 'custom'), eq(applicationDomains.status, 'verified'), eq(applicationDomains.isEnabled, true), isNull(applicationDomains.deletedAt))).limit(1);
					if (!custom) throw new Error('Verify and enable a custom domain before disabling the platform domain.');
					replacementPrimaryId = domain.isPrimary ? custom.id : undefined;
				}
				await synchronize(application.resourceProviderId, await enabledHostnames(applicationId, { domainId, enabled }));
				await db.transaction(async (transaction) => {
					await transaction.update(applicationDomains).set({ isEnabled: enabled, isPrimary: enabled ? domain.isPrimary : false, tlsStatus: enabled ? 'provisioning' : domain.tlsStatus, updatedAt: new Date() }).where(eq(applicationDomains.id, domainId));
					if (replacementPrimaryId) await transaction.update(applicationDomains).set({ isPrimary: true, updatedAt: new Date() }).where(eq(applicationDomains.id, replacementPrimaryId));
				});
			}
			await recordAuditLog({ action: `application_domain.${input.action}`, actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, metadata: { domainId, enabled: input.enabled }, resourceId: domainId, resourceType: 'application_domain', userAgent: metadata.userAgent });
			return resp.success('Application domain updated.', null, resp.codes.UPDATED);
		} catch (error) {
			return resp.failure(error instanceof Error ? error.message : 'Unable to update domain.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}

	/** Detach a custom domain from the provider, then soft-delete it locally. */
	public static async remove(request: Request, workspaceId: number, applicationId: string, domainId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const [domain] = await db.select().from(applicationDomains).where(and(eq(applicationDomains.id, domainId), eq(applicationDomains.applicationBuildId, applicationId), isNull(applicationDomains.deletedAt))).limit(1);
			if (!domain) return resp.failure('Domain not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			if (domain.type !== 'custom') throw new Error('The platform domain cannot be removed.');
			const [replacement] = domain.isPrimary ? await db.select({ id: applicationDomains.id }).from(applicationDomains).where(and(eq(applicationDomains.applicationBuildId, applicationId), ne(applicationDomains.id, domainId), eq(applicationDomains.status, 'verified'), eq(applicationDomains.isEnabled, true), isNull(applicationDomains.deletedAt))).limit(1) : [];
			if (domain.isPrimary && !replacement) throw new Error('Choose or enable another primary domain before removing this domain.');
			await synchronize(application.resourceProviderId, await enabledHostnames(applicationId, { domainId, remove: true }));
			await db.transaction(async (transaction) => {
				await transaction.update(applicationDomains).set({ deletedAt: new Date(), deleteReason: 'Removed by customer.', isEnabled: false, isPrimary: false, updatedAt: new Date() }).where(eq(applicationDomains.id, domainId));
				if (replacement) await transaction.update(applicationDomains).set({ isPrimary: true, updatedAt: new Date() }).where(eq(applicationDomains.id, replacement.id));
			});
			await recordAuditLog({ action: 'application_domain.removed', actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, metadata: { hostname: domain.hostname }, resourceId: domainId, resourceType: 'application_domain', userAgent: metadata.userAgent });
			return resp.success('Custom domain removed.', null, resp.codes.UPDATED);
		} catch (error) {
			return resp.failure(error instanceof Error ? error.message : 'Unable to remove domain.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}
}
