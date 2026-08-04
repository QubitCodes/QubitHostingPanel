import { resolve4, resolve6, resolveCname, resolveTxt } from 'node:dns/promises';
import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { applicationBuilds, applicationDomains, customers, domainAccessRequests, domainOwnerships, workspaceMemberships, workspaceResources, workspaces } from '@db/schema';
import type { CreateApplicationDomainRequest, UpdateApplicationDomainRequest } from '@schemas/application';
import { recordAuditLog } from '@services/auditLogService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';
import { controllingOwnership, createOwnershipClaim } from '@services/domains/domainOwnershipService';
import type { RequestMetadata } from '@utils/request';

/** Resolve an application only when it belongs to the authenticated customer's workspace. */
async function ownedApplication(request: Request, workspacePublicId: number, applicationId: string, metadata: RequestMetadata) {
	const actor = await authenticateSession(request, metadata);
	const [application] = await db.select({ id: applicationBuilds.id, resourceProviderId: workspaceResources.providerResourceId, workspaceId: workspaces.id }).from(customers)
		.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
		.innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, workspacePublicId), isNull(workspaces.deletedAt)))
		.innerJoin(applicationBuilds, and(eq(applicationBuilds.workspaceId, workspaces.id), eq(applicationBuilds.id, applicationId), isNull(applicationBuilds.deletedAt)))
		.leftJoin(workspaceResources, eq(workspaceResources.id, applicationBuilds.resourceId))
		.where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt))).limit(1);
	if (!application) throw new Error('Application not found.');
	return { ...application, actorUserId: actor.userId };
}

/** Resolve a workspace only when it belongs to the authenticated customer. */
async function ownedWorkspace(request: Request, workspacePublicId: number, metadata: RequestMetadata) {
	const actor = await authenticateSession(request, metadata);
	const [workspace] = await db.select({ id: workspaces.id, role: workspaceMemberships.role }).from(customers)
		.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
		.innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, workspacePublicId), isNull(workspaces.deletedAt)))
		.where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt))).limit(1);
	if (!workspace) throw new Error('Workspace not found.');
	return workspace;
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
	/** List every active domain and its connected application in an owned workspace. */
	public static async workspaceIndex(request: Request, workspaceId: number, metadata: RequestMetadata): Promise<Response> {
		try {
			const workspace = await ownedWorkspace(request, workspaceId, metadata);
			const rows = await db.select({
				applicationId: applicationBuilds.id,
				applicationName: applicationBuilds.metadata,
				createdAt: applicationDomains.createdAt,
				hostname: applicationDomains.hostname,
				id: applicationDomains.id,
				isEnabled: applicationDomains.isEnabled,
				isPrimary: applicationDomains.isPrimary,
				status: applicationDomains.status,
				tlsCheckedAt: applicationDomains.tlsCheckedAt,
				tlsFailureReason: applicationDomains.tlsFailureReason,
				tlsStatus: applicationDomains.tlsStatus,
				type: applicationDomains.type,
				verificationToken: applicationDomains.verificationToken,
			}).from(applicationDomains)
				.innerJoin(applicationBuilds, and(eq(applicationBuilds.id, applicationDomains.applicationBuildId), eq(applicationBuilds.workspaceId, workspace.id), isNull(applicationBuilds.deletedAt)))
				.where(isNull(applicationDomains.deletedAt)).orderBy(asc(applicationDomains.hostname));
			return resp.success('Workspace domains retrieved.', rows.map(({ applicationName, ...row }) => ({ ...row, applicationName: String(applicationName?.name ?? 'Application') })));
		} catch {
			return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		}
	}

	/** Check hostname availability and current public DNS without blocking application creation. */
	public static async check(request: Request, workspaceId: number, hostname: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const workspace = await ownedWorkspace(request, workspaceId, metadata);
			const [assigned] = await db.select({ id: applicationDomains.id }).from(applicationDomains).where(and(eq(applicationDomains.hostname, hostname), isNull(applicationDomains.deletedAt))).limit(1);
			if (assigned) return resp.success('Domain check completed.', { available: false, dnsReady: false, records: [], reason: 'Domain is already connected to an application.' });
			const ownership = await controllingOwnership(hostname);
			const records: string[] = [];
			for (const resolver of [resolveCname, resolve4, resolve6]) {
				try { records.push(...await resolver(hostname)); } catch { /* A hostname may legitimately expose only one record type. */ }
			}
			const approvalRequired = Boolean(ownership && ownership.workspaceId !== workspace.id);
			return resp.success('Domain check completed.', { available: true, approvalRequired, dnsReady: records.length > 0, records, reason: approvalRequired ? `Owner approval is required for this subdomain of ${ownership?.hostname}.` : records.length ? null : 'No public CNAME, A, or AAAA record is visible yet.' });
		} catch {
			return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		}
	}

	/** List ownership scopes plus incoming and outgoing cross-workspace requests. */
	public static async ownershipIndex(request: Request, workspaceId: number, metadata: RequestMetadata): Promise<Response> {
		try {
			const workspace = await ownedWorkspace(request, workspaceId, metadata);
			const [ownerships, incoming, outgoing] = await Promise.all([
				db.select().from(domainOwnerships).where(and(eq(domainOwnerships.workspaceId, workspace.id), isNull(domainOwnerships.deletedAt))).orderBy(asc(domainOwnerships.hostname)),
				db.select({ id: domainAccessRequests.id, hostname: domainAccessRequests.hostname, status: domainAccessRequests.status, createdAt: domainAccessRequests.createdAt, requestingWorkspaceId: workspaces.publicId, requestingWorkspaceName: workspaces.name, applicationDomainId: domainAccessRequests.applicationDomainId }).from(domainAccessRequests).innerJoin(domainOwnerships, eq(domainOwnerships.id, domainAccessRequests.ownershipId)).innerJoin(workspaces, eq(workspaces.id, domainAccessRequests.requestingWorkspaceId)).where(and(eq(domainOwnerships.workspaceId, workspace.id), isNull(domainAccessRequests.deletedAt))).orderBy(desc(domainAccessRequests.createdAt)),
				db.select({ id: domainAccessRequests.id, hostname: domainAccessRequests.hostname, status: domainAccessRequests.status, createdAt: domainAccessRequests.createdAt, applicationId: domainAccessRequests.applicationBuildId, ownerHostname: domainOwnerships.hostname }).from(domainAccessRequests).innerJoin(domainOwnerships, eq(domainOwnerships.id, domainAccessRequests.ownershipId)).where(and(eq(domainAccessRequests.requestingWorkspaceId, workspace.id), isNull(domainAccessRequests.deletedAt))).orderBy(desc(domainAccessRequests.createdAt)),
			]);
			return resp.success('Domain ownership retrieved.', { ownerships, incoming, outgoing, canApprove: workspace.role === 'owner' });
		} catch { return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); }
	}

	/** Approve, reject, or revoke one protected-subdomain request as the verified owner. */
	public static async respondToAccess(request: Request, workspaceId: number, requestId: string, action: 'approve' | 'reject' | 'revoke', metadata: RequestMetadata): Promise<Response> {
		try {
			const workspace = await ownedWorkspace(request, workspaceId, metadata);
			if (workspace.role !== 'owner') return resp.failure('Only the workspace owner can respond to domain access requests.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403);
			const [record] = await db.select({ id: domainAccessRequests.id, status: domainAccessRequests.status, hostname: domainAccessRequests.hostname, domainId: applicationDomains.id, applicationId: applicationBuilds.id, isPrimary: applicationDomains.isPrimary, providerId: workspaceResources.providerResourceId }).from(domainAccessRequests)
				.innerJoin(domainOwnerships, and(eq(domainOwnerships.id, domainAccessRequests.ownershipId), eq(domainOwnerships.workspaceId, workspace.id), eq(domainOwnerships.status, 'verified'), isNull(domainOwnerships.deletedAt)))
				.innerJoin(applicationDomains, and(eq(applicationDomains.id, domainAccessRequests.applicationDomainId), isNull(applicationDomains.deletedAt)))
				.innerJoin(applicationBuilds, and(eq(applicationBuilds.id, domainAccessRequests.applicationBuildId), isNull(applicationBuilds.deletedAt)))
				.leftJoin(workspaceResources, eq(workspaceResources.id, applicationBuilds.resourceId))
				.where(and(eq(domainAccessRequests.id, requestId), isNull(domainAccessRequests.deletedAt))).limit(1);
			if (!record) return resp.failure('Domain access request not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			if (action === 'approve') {
				if (record.status !== 'pending') throw new Error('Only a pending request can be approved.');
				await synchronize(record.providerId, await enabledHostnames(record.applicationId, { domainId: record.domainId, enabled: true, verified: true }));
				await db.transaction(async (transaction) => {
					await transaction.update(applicationDomains).set({ status: 'verified', isEnabled: true, verifiedAt: new Date(), tlsStatus: 'provisioning', updatedAt: new Date() }).where(eq(applicationDomains.id, record.domainId));
					await transaction.update(domainAccessRequests).set({ status: 'approved', respondedAt: new Date(), respondedByWorkspaceId: workspace.id, updatedAt: new Date() }).where(eq(domainAccessRequests.id, record.id));
				});
			} else if (action === 'reject') {
				if (record.status !== 'pending') throw new Error('Only a pending request can be rejected.');
				await db.update(domainAccessRequests).set({ status: 'rejected', respondedAt: new Date(), respondedByWorkspaceId: workspace.id, updatedAt: new Date() }).where(eq(domainAccessRequests.id, record.id));
			} else {
				if (record.status !== 'approved') throw new Error('Only approved access can be revoked.');
				if (record.isPrimary) throw new Error('The requesting workspace must choose another primary domain before access can be revoked.');
				await synchronize(record.providerId, await enabledHostnames(record.applicationId, { domainId: record.domainId, enabled: false }));
				await db.transaction(async (transaction) => {
					await transaction.update(applicationDomains).set({ status: 'pending', isEnabled: false, tlsStatus: 'pending', updatedAt: new Date() }).where(eq(applicationDomains.id, record.domainId));
					await transaction.update(domainAccessRequests).set({ status: 'revoked', respondedAt: new Date(), respondedByWorkspaceId: workspace.id, updatedAt: new Date() }).where(eq(domainAccessRequests.id, record.id));
				});
			}
			await recordAuditLog({ action: `domain_access.${action}`, actorUserId: (await authenticateSession(request, metadata)).userId, ipAddress: metadata.ipAddress, metadata: { hostname: record.hostname }, resourceId: record.id, resourceType: 'domain_access_request', userAgent: metadata.userAgent });
			const responseMessage = action === 'approve' ? 'Domain access approved.' : action === 'reject' ? 'Domain access rejected.' : 'Domain access revoked.';
			return resp.success(responseMessage, null, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to update domain access.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422); }
	}
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
			const controlling = await controllingOwnership(input.hostname);
			const ownVerified = controlling?.workspaceId === application.workspaceId;
			const claim = controlling ?? await createOwnershipClaim(application.workspaceId, input.hostname);
			const needsApproval = controlling && controlling.workspaceId !== application.workspaceId;
			const immediatelyVerified = ownVerified || (!needsApproval && claim.status === 'verified');
			const [domain] = await db.insert(applicationDomains).values({ applicationBuildId: applicationId, hostname: input.hostname, type: 'custom', status: immediatelyVerified ? 'verified' : 'pending', isEnabled: immediatelyVerified, verifiedAt: immediatelyVerified ? new Date() : null, tlsStatus: immediatelyVerified ? 'provisioning' : 'pending', verificationToken: needsApproval ? null : claim.verificationToken }).returning();
			if (!domain) throw new Error('Unable to add domain.');
			if (needsApproval) await db.insert(domainAccessRequests).values({ ownershipId: claim.id, requestingWorkspaceId: application.workspaceId, applicationBuildId: applicationId, applicationDomainId: domain.id, hostname: input.hostname });
			if (immediatelyVerified) await synchronize(application.resourceProviderId, await enabledHostnames(applicationId));
			await recordAuditLog({ action: 'application_domain.created', actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, metadata: { hostname: input.hostname }, resourceId: domain?.id, resourceType: 'application_domain', userAgent: metadata.userAgent });
			return resp.success(needsApproval ? 'Domain access requested from its verified owner.' : immediatelyVerified ? 'Custom domain added and enabled.' : 'Custom domain added. Create the displayed TXT record before verification.', { ...domain, approvalRequired: Boolean(needsApproval) }, resp.codes.CREATED, undefined, 201);
		} catch (error) {
			return resp.failure(error instanceof Error && /unique/i.test(error.message) ? 'Domain is already assigned.' : 'Unable to add domain.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409);
		}
	}

	/** Verify DNS ownership and attach the hostname to the provider before enabling it locally. */
	public static async verify(request: Request, workspaceId: number, applicationId: string, domainId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const [domain] = await db.select().from(applicationDomains).where(and(eq(applicationDomains.id, domainId), eq(applicationDomains.applicationBuildId, applicationId), eq(applicationDomains.type, 'custom'), isNull(applicationDomains.deletedAt))).limit(1);
			if (!domain) throw new Error('Domain not found.');
			const ownership = await controllingOwnership(domain.hostname);
			if (ownership && ownership.workspaceId !== application.workspaceId) return resp.failure('This domain is controlled by another workspace. Owner approval is required.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403);
			const [claim] = ownership ? [ownership] : await db.select().from(domainOwnerships).where(and(eq(domainOwnerships.hostname, domain.hostname), eq(domainOwnerships.workspaceId, application.workspaceId), isNull(domainOwnerships.deletedAt))).limit(1);
			if (!claim) throw new Error('Domain ownership claim not found.');
			if (claim.status !== 'verified') {
				if (!claim.verificationToken) throw new Error('Domain verification token is unavailable.');
				const records = (await resolveTxt(`_qubit-verification.${claim.hostname}`)).flat();
				if (!records.includes(claim.verificationToken)) return resp.failure('Verification TXT record was not found.', resp.codes.INVALID_INPUT_DATA, undefined, { expectedHost: `_qubit-verification.${claim.hostname}`, expectedValue: claim.verificationToken }, undefined, 422);
				await db.update(domainOwnerships).set({ status: 'verified', verifiedAt: new Date(), updatedAt: new Date() }).where(eq(domainOwnerships.id, claim.id));
			}
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

	/** Detach a saved domain from the provider, preserving a verified primary replacement. */
	public static async remove(request: Request, workspaceId: number, applicationId: string, domainId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const application = await ownedApplication(request, workspaceId, applicationId, metadata);
			const [domain] = await db.select().from(applicationDomains).where(and(eq(applicationDomains.id, domainId), eq(applicationDomains.applicationBuildId, applicationId), isNull(applicationDomains.deletedAt))).limit(1);
			if (!domain) return resp.failure('Domain not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const [replacement] = domain.isPrimary || domain.type === 'platform' ? await db.select({ id: applicationDomains.id }).from(applicationDomains).where(and(eq(applicationDomains.applicationBuildId, applicationId), ne(applicationDomains.id, domainId), eq(applicationDomains.status, 'verified'), eq(applicationDomains.isEnabled, true), isNull(applicationDomains.deletedAt))).limit(1) : [];
			if (domain.type === 'platform' && !replacement) throw new Error('Verify and enable another domain before removing the platform subdomain.');
			if (domain.isPrimary && !replacement) throw new Error('Choose or enable another primary domain before removing this domain.');
			await synchronize(application.resourceProviderId, await enabledHostnames(applicationId, { domainId, remove: true }));
			await db.transaction(async (transaction) => {
				await transaction.update(applicationDomains).set({ deletedAt: new Date(), deleteReason: 'Removed by customer.', isEnabled: false, isPrimary: false, updatedAt: new Date() }).where(eq(applicationDomains.id, domainId));
				if (replacement) await transaction.update(applicationDomains).set({ isPrimary: true, updatedAt: new Date() }).where(eq(applicationDomains.id, replacement.id));
			});
			await recordAuditLog({ action: 'application_domain.removed', actorUserId: application.actorUserId, ipAddress: metadata.ipAddress, metadata: { hostname: domain.hostname }, resourceId: domainId, resourceType: 'application_domain', userAgent: metadata.userAgent });
			return resp.success('Domain removed.', null, resp.codes.UPDATED);
		} catch (error) {
			return resp.failure(error instanceof Error ? error.message : 'Unable to remove domain.', resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}
}
