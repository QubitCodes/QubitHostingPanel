import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { resp } from "@qubitcodes/qcresp";

import { db } from "@db/client";
import {
  applicationBuilds,
  applicationDatabaseBindings,
  applicationDeployments,
  customers,
  logicalDatabases,
  provisioningJobs,
  runtimeImages,
  workspaceMemberships,
  workspaceResources,
  workspaces,
  workspaceSubscriptions,
} from "@db/schema";
import type { CreateApplicationRequest } from "@schemas/application";
import { recordAuditLog } from "@services/auditLogService";
import { authenticateSession } from "@services/auth/authenticatedSessionService";
import { hostingProvider } from "@services/hosting/hostingProviderFactory";
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
      return resp.success("Application options retrieved.", {
        runtimes,
        databases,
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
      return resp.success("Applications retrieved.", rows);
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
      if (input.domain) {
        const [conflict] = await db
          .select({ id: applicationBuilds.id })
          .from(applicationBuilds)
          .where(
            and(
              eq(applicationBuilds.requestedDomain, input.domain),
              isNull(applicationBuilds.deletedAt),
            ),
          )
          .limit(1);
        if (conflict)
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
            requestedDomain: input.domain,
            metadata: { name: input.name, buildPack: input.buildPack },
          })
          .returning({ id: applicationBuilds.id });
        if (!build) throw new Error("Unable to persist application.");
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
