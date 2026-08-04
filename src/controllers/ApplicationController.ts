import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { resp } from "@qubitcodes/qcresp";

import { db } from "@db/client";
import {
  applicationBuilds,
  applicationDatabaseBindings,
  applicationDeployments,
  applicationDomains,
  customers,
  domainAccessRequests,
  domainOwnerships,
  logicalDatabases,
  provisioningJobs,
  runtimeImages,
  workspaceMemberships,
  workspaceResources,
  workspaces,
  workspaceSubscriptions,
} from "@db/schema";
import type { CreateApplicationRequest, UpdateApplicationRequest } from "@schemas/application";
import { recordAuditLog } from "@services/auditLogService";
import { authenticateSession } from "@services/auth/authenticatedSessionService";
import { hostingProvider } from "@services/hosting/hostingProviderFactory";
import { getEffectivePlatformUrls } from '@services/platformUrlService';
import { controllingOwnership, ownershipVerificationEnabled } from '@services/domains/domainOwnershipService';
import { commitUsageReservation, releaseUsageReservation, reserveWorkspaceUsage } from "@services/usage/quotaEngine";
import type { RequestMetadata } from "@utils/request";

async function access(
  request: Request,
  publicId: number,
  metadata: RequestMetadata,
) {
  const actor = await authenticateSession(request, metadata);
  const [row] = await db
    .select({
      id: workspaces.id,
      subscriptionId: workspaceSubscriptions.id,
      entitlementSnapshot: workspaceSubscriptions.entitlementSnapshot,
    })
    .from(customers)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.customerId, customers.id),
        eq(workspaceMemberships.status, "active"),
        isNull(workspaceMemberships.deletedAt),
      ),
    )
    .innerJoin(
      workspaces,
      and(
        eq(workspaces.id, workspaceMemberships.workspaceId),
        eq(workspaces.publicId, publicId),
        eq(workspaces.status, "active"),
        isNull(workspaces.deletedAt),
      ),
    )
    .innerJoin(
      workspaceSubscriptions,
      and(
        eq(workspaceSubscriptions.workspaceId, workspaces.id),
        sql`${workspaceSubscriptions.status} IN ('active', 'trialing')`,
        isNull(workspaceSubscriptions.deletedAt),
      ),
    )
    .where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt)))
    .limit(1);
  if (!row) throw new Error("Workspace not found.");
  return { ...row, actorUserId: actor.userId };
}
const fields = {
  id: applicationBuilds.id,
  status: applicationBuilds.status,
  sourceRepository: applicationBuilds.sourceRepository,
  sourceRef: applicationBuilds.sourceRef,
  installCommand: applicationBuilds.installCommand,
  buildCommand: applicationBuilds.buildCommand,
  startCommand: applicationBuilds.startCommand,
  baseDirectory: applicationBuilds.baseDirectory,
  publishDirectory: applicationBuilds.publishDirectory,
  applicationPort: applicationBuilds.applicationPort,
  requestedDomain: applicationBuilds.requestedDomain,
  failureReason: applicationBuilds.failureReason,
  metadata: applicationBuilds.metadata,
  createdAt: applicationBuilds.createdAt,
  runtimeCode: runtimeImages.code,
  runtimeLanguage: runtimeImages.language,
  runtimeVersion: runtimeImages.version,
  resourceStatus: workspaceResources.status,
  publicUrl: workspaceResources.publicUrl,
};

/** Workspace-owned source application configuration and deployment lifecycle. */
export class ApplicationController {
  public static async options(
    request: Request,
    workspacePublicId: number,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const workspace = await access(request, workspacePublicId, metadata);
      const [runtimes, databases] = await Promise.all([
        db
          .select({
            code: runtimeImages.code,
            language: runtimeImages.language,
            version: runtimeImages.version,
            defaultPort: runtimeImages.defaultPort,
            isDefault: runtimeImages.isDefault,
          })
          .from(runtimeImages)
          .where(
            and(
              eq(runtimeImages.status, "active"),
              isNull(runtimeImages.deletedAt),
            ),
          )
          .orderBy(asc(runtimeImages.language), asc(runtimeImages.version)),
        db
          .select({
            id: logicalDatabases.id,
            databaseName: logicalDatabases.databaseName,
          })
          .from(logicalDatabases)
          .where(
            and(
              eq(logicalDatabases.workspaceId, workspace.id),
              eq(logicalDatabases.status, "active"),
              isNull(logicalDatabases.deletedAt),
            ),
          )
          .orderBy(asc(logicalDatabases.databaseName)),
      ]);
      const platform = await getEffectivePlatformUrls();
      return resp.success("Application options retrieved.", {
        runtimes,
        databases,
        applicationBaseDomain: platform.applicationBaseDomain,
        applicationDomainReady: platform.applicationDomainReady,
      });
    } catch {
      return resp.failure(
        "Workspace not found.",
        resp.codes.RESOURCE_NOT_FOUND,
        undefined,
        null,
        undefined,
        404,
      );
    }
  }
  public static async index(
    request: Request,
    workspacePublicId: number,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const workspace = await access(request, workspacePublicId, metadata);
      const rows = await db
        .select(fields)
        .from(applicationBuilds)
        .innerJoin(
          runtimeImages,
          eq(runtimeImages.id, applicationBuilds.runtimeImageId),
        )
        .leftJoin(
          workspaceResources,
          eq(workspaceResources.id, applicationBuilds.resourceId),
        )
        .where(
          and(
            eq(applicationBuilds.workspaceId, workspace.id),
            isNull(applicationBuilds.deletedAt),
          ),
        )
        .orderBy(desc(applicationBuilds.createdAt));
      const ids = rows.map(({ id }) => id);
      const [domains, bindings, deployments] = ids.length ? await Promise.all([
		db.select().from(applicationDomains).where(and(inArray(applicationDomains.applicationBuildId, ids), isNull(applicationDomains.deletedAt))).orderBy(asc(applicationDomains.createdAt)),
		db.select({ applicationBuildId: applicationDatabaseBindings.applicationBuildId, databaseId: logicalDatabases.id, databaseName: logicalDatabases.databaseName, environmentPrefix: applicationDatabaseBindings.environmentPrefix }).from(applicationDatabaseBindings).innerJoin(logicalDatabases, eq(logicalDatabases.id, applicationDatabaseBindings.logicalDatabaseId)).where(and(inArray(applicationDatabaseBindings.applicationBuildId, ids), isNull(applicationDatabaseBindings.deletedAt), isNull(logicalDatabases.deletedAt))),
		db.select().from(applicationDeployments).where(and(inArray(applicationDeployments.applicationBuildId, ids), isNull(applicationDeployments.deletedAt))).orderBy(desc(applicationDeployments.createdAt)),
	  ]) : [[], [], []];
      return resp.success("Applications retrieved.", rows.map((row) => ({ ...row, name: String(row.metadata?.name ?? row.sourceRepository.split('/').pop() ?? 'Application'), buildPack: String(row.metadata?.buildPack ?? 'nixpacks'), domains: domains.filter((domain) => domain.applicationBuildId === row.id), databases: bindings.filter((binding) => binding.applicationBuildId === row.id), latestDeployment: deployments.find((deployment) => deployment.applicationBuildId === row.id) })));
    } catch {
      return resp.failure(
        "Workspace not found.",
        resp.codes.RESOURCE_NOT_FOUND,
        undefined,
        null,
        undefined,
        404,
      );
    }
  }

  /** Update an owned application's deployable configuration and queue a fresh deployment. */
  public static async update(request: Request, workspacePublicId: number, applicationId: string, input: UpdateApplicationRequest, metadata: RequestMetadata): Promise<Response> {
	try {
		const workspace = await access(request, workspacePublicId, metadata);
		const [application] = await db.select().from(applicationBuilds).where(and(eq(applicationBuilds.id, applicationId), eq(applicationBuilds.workspaceId, workspace.id), isNull(applicationBuilds.deletedAt))).limit(1);
		if (!application) return resp.failure('Application not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
		const now = new Date();
		const result = await db.transaction(async (transaction) => {
			await transaction.update(applicationBuilds).set({ sourceRef: input.branch, installCommand: input.installCommand, buildCommand: input.buildCommand, startCommand: input.startCommand, baseDirectory: input.baseDirectory, publishDirectory: input.publishDirectory, applicationPort: input.port, status: 'queued', completedAt: null, failureReason: null, updatedAt: now }).where(eq(applicationBuilds.id, applicationId));
			const [deployment] = await transaction.insert(applicationDeployments).values({ workspaceId: workspace.id, applicationBuildId: applicationId }).returning({ id: applicationDeployments.id });
			const [job] = await transaction.insert(provisioningJobs).values({ workspaceId: workspace.id, subscriptionId: workspace.subscriptionId, provider: process.env.HOSTING_PROVIDER === 'coolify' ? 'coolify' : 'mock', idempotencyKey: `application:${applicationId}:update:${randomUUID()}`, input: { applicationBuildId: applicationId, deploymentId: deployment?.id } }).returning({ id: provisioningJobs.id });
			return { deploymentId: deployment?.id, jobId: job?.id };
		});
		await recordAuditLog({ actorUserId: workspace.actorUserId, action: 'application.configuration_updated', resourceType: 'application_build', resourceId: applicationId, metadata: { workspacePublicId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
		return resp.success('Application updated and deployment queued.', result, resp.codes.ACCEPTED, undefined, 202);
	} catch (error) {
		return resp.failure(error instanceof Error ? error.message : 'Application update failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
	}
  }
  public static async create(
    request: Request,
    workspacePublicId: number,
    input: CreateApplicationRequest,
    metadata: RequestMetadata,
  ): Promise<Response> {
    let reservationId: string | undefined;
    try {
      const workspace = await access(request, workspacePublicId, metadata);
      const [{ used }] = await db
        .select({ used: count() })
        .from(applicationBuilds)
        .where(
          and(
            eq(applicationBuilds.workspaceId, workspace.id),
            isNull(applicationBuilds.deletedAt),
          ),
        );
      const [runtime] = await db
        .select()
        .from(runtimeImages)
        .where(
          and(
            eq(runtimeImages.code, input.runtimeCode),
            eq(runtimeImages.status, "active"),
            isNull(runtimeImages.deletedAt),
          ),
        )
        .limit(1);
      if (!runtime)
        return resp.failure(
          "Runtime is unavailable.",
          resp.codes.RESOURCE_NOT_FOUND,
          undefined,
          null,
          undefined,
          404,
        );
      const uniquePrefixes = new Set(
        input.databases.map((item) => item.environmentPrefix),
      );
      if (uniquePrefixes.size !== input.databases.length)
        return resp.failure(
          "Database environment prefixes must be unique.",
          resp.codes.VALIDATION_ERROR,
          undefined,
          null,
          undefined,
          400,
        );
      if (input.databases.length) {
        const selected = await db
          .select({ id: logicalDatabases.id })
          .from(logicalDatabases)
          .where(
            and(
              eq(logicalDatabases.workspaceId, workspace.id),
              eq(logicalDatabases.status, "active"),
              isNull(logicalDatabases.deletedAt),
            ),
          );
        const allowed = new Set(selected.map(({ id }) => id));
        if (input.databases.some(({ databaseId }) => !allowed.has(databaseId)))
          return resp.failure(
            "A selected database is unavailable.",
            resp.codes.RESOURCE_NOT_FOUND,
            undefined,
            null,
            undefined,
            404,
          );
      }
      const customHostnames = [...new Set([...(input.domain ? [input.domain] : []), ...input.domains])];
	  const verificationRequired = await ownershipVerificationEnabled();
	  const domainPolicies = await Promise.all(customHostnames.map(async (hostname) => ({ hostname, ownership: await controllingOwnership(hostname) })));
      if (customHostnames.length) {
		const conflicts = await db
          .select({ id: applicationBuilds.id })
          .from(applicationDomains)
          .innerJoin(applicationBuilds, eq(applicationBuilds.id, applicationDomains.applicationBuildId))
          .where(
            and(
              inArray(applicationDomains.hostname, customHostnames),
              isNull(applicationDomains.deletedAt),
            ),
          );
		if (conflicts.length)
          return resp.failure(
            "Domain is already assigned.",
            resp.codes.RESOURCE_ALREADY_EXISTS,
            undefined,
            null,
            undefined,
            409,
          );
      }
      const reservation = await reserveWorkspaceUsage({ workspaceId: workspace.id, code: "applications.count", current: Number(used), quantity: 1, idempotencyKey: `application-create:${randomUUID()}` });
      reservationId = reservation.reservationId;
      if (!reservation.allowed || !reservationId)
        return resp.failure("Workspace application limit reached.", resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, { quota: reservation }, undefined, 422);
      const platform = await getEffectivePlatformUrls();
      const subdomain = input.subdomain ?? input.name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
      const platformHostname = `${subdomain}.${platform.applicationBaseDomain}`;
	  if (customHostnames.includes(platformHostname)) {
		await releaseUsageReservation(reservationId, 'Custom domain duplicated the platform subdomain.');
		return resp.failure('A custom domain cannot duplicate the platform subdomain.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409);
	  }
      const [hostnameConflict] = await db.select({ id: applicationDomains.id }).from(applicationDomains).where(and(eq(applicationDomains.hostname, platformHostname), isNull(applicationDomains.deletedAt))).limit(1);
	  if (hostnameConflict) {
		await releaseUsageReservation(reservationId, 'Application subdomain is already assigned.');
		return resp.failure('Application subdomain is already assigned.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409);
	  }
      const result = await db.transaction(async (transaction) => {
        const [build] = await transaction
          .insert(applicationBuilds)
          .values({
            workspaceId: workspace.id,
            runtimeImageId: runtime.id,
            status: "queued",
            sourceRepository: input.repository,
            sourceRef: input.branch,
            installCommand: input.installCommand,
            buildCommand: input.buildCommand,
            startCommand: input.startCommand,
            baseDirectory: input.baseDirectory,
            publishDirectory: input.publishDirectory,
            applicationPort: input.port,
			requestedDomain: customHostnames[0],
            metadata: { name: input.name, buildPack: input.buildPack },
          })
          .returning({ id: applicationBuilds.id });
        if (!build) throw new Error("Unable to persist application.");
		const domainRows = await transaction.insert(applicationDomains).values([
          { applicationBuildId: build.id, hostname: platformHostname, type: 'platform', status: platform.applicationDomainReady ? 'verified' : 'pending', isPrimary: true, isEnabled: true, verifiedAt: platform.applicationDomainReady ? new Date() : null },
		  ...domainPolicies.map(({ hostname, ownership }) => {
			const owned = ownership?.workspaceId === workspace.id;
			const direct = owned || (!ownership && !verificationRequired);
			return { applicationBuildId: build.id, hostname, type: 'custom' as const, status: direct ? 'verified' as const : 'pending' as const, isPrimary: false, isEnabled: direct, verifiedAt: direct ? new Date() : null, tlsStatus: direct ? 'provisioning' as const : 'pending' as const, verificationToken: ownership ? null : verificationRequired ? randomUUID() : null };
		  }),
		]).returning({ id: applicationDomains.id, hostname: applicationDomains.hostname, verificationToken: applicationDomains.verificationToken });
		for (const policy of domainPolicies) {
			const domain = domainRows.find((row) => row.hostname === policy.hostname);
			if (!domain) throw new Error('Unable to persist custom domain.');
			if (!policy.ownership) {
				await transaction.insert(domainOwnerships).values({ workspaceId: workspace.id, hostname: policy.hostname, status: verificationRequired ? 'pending' : 'verified', verificationToken: domain.verificationToken, verificationMethod: verificationRequired ? 'dns_txt' : 'platform_bypass', verifiedAt: verificationRequired ? null : new Date() });
			} else if (policy.ownership.workspaceId !== workspace.id) {
				await transaction.insert(domainAccessRequests).values({ ownershipId: policy.ownership.id, requestingWorkspaceId: workspace.id, applicationBuildId: build.id, applicationDomainId: domain.id, hostname: policy.hostname });
			}
		}
        if (input.databases.length)
          await transaction
            .insert(applicationDatabaseBindings)
            .values(
              input.databases.map((item) => ({
                applicationBuildId: build.id,
                logicalDatabaseId: item.databaseId,
                environmentPrefix: item.environmentPrefix,
              })),
            );
        const [deployment] = await transaction
          .insert(applicationDeployments)
          .values({ workspaceId: workspace.id, applicationBuildId: build.id })
          .returning({ id: applicationDeployments.id });
        const [job] = await transaction
          .insert(provisioningJobs)
          .values({
            workspaceId: workspace.id,
            subscriptionId: workspace.subscriptionId,
            provider:
              process.env.HOSTING_PROVIDER === "coolify" ? "coolify" : "mock",
            idempotencyKey: `application:${build.id}:deploy`,
            input: {
              applicationBuildId: build.id,
              deploymentId: deployment?.id,
            },
          })
          .returning({ id: provisioningJobs.id });
        return { id: build.id, deploymentId: deployment?.id, jobId: job?.id };
      });
      await commitUsageReservation(reservationId, "application_build", result.id);
      await recordAuditLog({
        actorUserId: workspace.actorUserId,
        action: "application.deployment_queued",
        resourceType: "application_build",
        resourceId: result.id,
        metadata: {
          workspacePublicId,
          runtimeCode: input.runtimeCode,
          databaseCount: input.databases.length,
		  domainCount: customHostnames.length,
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        "Application deployment queued.",
        result,
        resp.codes.ACCEPTED,
        undefined,
        202,
      );
    } catch (error) {
      if (reservationId) await releaseUsageReservation(reservationId, error instanceof Error ? error.message : "Application creation failed.");
      return resp.failure(
        error instanceof Error ? error.message : "Application creation failed.",
        resp.codes.INTERNAL_SERVICE_ERROR,
        undefined,
        null,
        undefined,
        500,
      );
    }
  }
  public static async logs(
    request: Request,
    workspacePublicId: number,
    applicationId: string,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const workspace = await access(request, workspacePublicId, metadata);
      const [record] = await db
        .select({ providerResourceId: workspaceResources.providerResourceId })
        .from(applicationBuilds)
        .innerJoin(
          workspaceResources,
          eq(workspaceResources.id, applicationBuilds.resourceId),
        )
        .where(
          and(
            eq(applicationBuilds.id, applicationId),
            eq(applicationBuilds.workspaceId, workspace.id),
            isNull(applicationBuilds.deletedAt),
          ),
        )
        .limit(1);
      if (!record)
        return resp.failure(
          "Application not found.",
          resp.codes.RESOURCE_NOT_FOUND,
          undefined,
          null,
          undefined,
          404,
        );
      return resp.success("Application logs retrieved.", {
        logs: await (await hostingProvider()).getApplicationLogs(
          record.providerResourceId,
          200,
        ),
      });
    } catch (error) {
      return resp.failure(
        error instanceof Error
          ? error.message
          : "Application logs unavailable.",
        resp.codes.EXTERNAL_SERVICE_ERROR,
        undefined,
        null,
        undefined,
        502,
      );
    }
  }
}
