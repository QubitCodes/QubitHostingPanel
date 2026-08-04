import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { resp } from "@qubitcodes/qcresp";

import { db } from "@db/client";
import {
  applicationBuilds,
  applicationDatabaseBindings,
  customers,
  databaseClusters,
  logicalDatabases,
  workspaceMemberships,
  workspaceResources,
  workspaces,
  workspaceSubscriptions,
} from "@db/schema";
import type { CreateLogicalDatabaseRequest } from "@schemas/logicalDatabase";
import { recordAuditLog } from "@services/auditLogService";
import { authenticateSession } from "@services/auth/authenticatedSessionService";
import { sharedDatabaseProvisioner } from "@services/databases/sharedDatabaseProvisionerFactory";
import { databaseClusterEndpoint } from "@services/databases/databaseClusterEndpointService";
import {
  decryptCredential,
  encryptCredential,
} from "@services/encryption/credentialEncryptionService";
import { commitUsageReservation, releaseUsageReservation, reserveWorkspaceUsage } from "@services/usage/quotaEngine";
import type { RequestMetadata } from "@utils/request";

interface ClusterCredential {
  database: string;
  password: string;
  username: string;
}
interface WorkspaceAccess {
  entitlementSnapshot: Array<Record<string, unknown>>;
  id: string;
  publicId: number;
}

async function workspaceAccess(
  request: Request,
  publicId: number,
  metadata: RequestMetadata,
): Promise<{ actorUserId: string; workspace: WorkspaceAccess }> {
  const actor = await authenticateSession(request, metadata);
  const [workspace] = await db
    .select({
      id: workspaces.id,
      publicId: workspaces.publicId,
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
  if (!workspace) throw new Error("Workspace not found.");
  return { actorUserId: actor.userId, workspace };
}


const logicalDatabasePublicFields = {
  id: logicalDatabases.id,
  status: logicalDatabases.status,
  databaseName: logicalDatabases.databaseName,
  username: logicalDatabases.username,
  storageQuotaMb: logicalDatabases.storageQuotaMb,
  connectionLimit: logicalDatabases.connectionLimit,
  createdAt: logicalDatabases.createdAt,
  metadata: logicalDatabases.metadata,
};
const publicFields = {
  ...logicalDatabasePublicFields,
  engine: databaseClusters.engine,
  engineVersion: databaseClusters.engineVersion,
};

/** Adds the selected cluster version to a newly inserted logical-database record. */
export function composeLogicalDatabaseResponse<
  T extends Record<string, unknown>,
>(
  record: T,
  cluster: { engine: "mysql" | "postgresql"; engineVersion: string },
): T & { engine: "mysql" | "postgresql"; engineVersion: string } {
  return {
    ...record,
    engine: cluster.engine,
    engineVersion: cluster.engineVersion,
  };
}

/** Customer-authorized shared logical database lifecycle. */
export class LogicalDatabaseController {
  public static async index(
    request: Request,
    workspacePublicId: number,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const { workspace } = await workspaceAccess(
        request,
        workspacePublicId,
        metadata,
      );
      const rows = await db
        .select(publicFields)
        .from(logicalDatabases)
        .innerJoin(
          databaseClusters,
          eq(databaseClusters.id, logicalDatabases.clusterId),
        )
        .where(
          and(
            eq(logicalDatabases.workspaceId, workspace.id),
            isNull(logicalDatabases.deletedAt),
          ),
        )
        .orderBy(asc(logicalDatabases.createdAt));
      const ids = rows.map(({ id }) => id);
      const bindings = ids.length ? await db.select({ applicationId: applicationBuilds.id, applicationName: applicationBuilds.metadata, databaseId: applicationDatabaseBindings.logicalDatabaseId }).from(applicationDatabaseBindings).innerJoin(applicationBuilds, eq(applicationBuilds.id, applicationDatabaseBindings.applicationBuildId)).where(and(inArray(applicationDatabaseBindings.logicalDatabaseId, ids), isNull(applicationDatabaseBindings.deletedAt), isNull(applicationBuilds.deletedAt))) : [];
      return resp.success("Workspace databases retrieved.", rows.map((row) => ({ ...row, displayName: String(row.metadata?.displayName ?? row.databaseName), connectedApplications: bindings.filter(({ databaseId }) => databaseId === row.id).map((binding) => ({ id: binding.applicationId, name: String(binding.applicationName?.name ?? 'Application') })) })));
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
    input: CreateLogicalDatabaseRequest,
    metadata: RequestMetadata,
  ): Promise<Response> {
    let reservationId: string | undefined;
    try {
      const { actorUserId, workspace } = await workspaceAccess(
        request,
        workspacePublicId,
        metadata,
      );
      const [{ value: used }] = await db
        .select({ value: count() })
        .from(logicalDatabases)
        .where(
          and(
            eq(logicalDatabases.workspaceId, workspace.id),
            isNull(logicalDatabases.deletedAt),
          ),
        );
      const [cluster] = await db
        .select({ cluster: databaseClusters, used: count(logicalDatabases.id) })
        .from(databaseClusters)
        .leftJoin(
          logicalDatabases,
          and(
            eq(logicalDatabases.clusterId, databaseClusters.id),
            isNull(logicalDatabases.deletedAt),
          ),
        )
        .where(
          and(
            eq(databaseClusters.engine, input.engine),
            eq(databaseClusters.status, "active"),
            isNull(databaseClusters.deletedAt),
          ),
        )
        .groupBy(databaseClusters.id)
        .having(
          sql`${databaseClusters.maximumDatabases} IS NULL OR count(${logicalDatabases.id}) < ${databaseClusters.maximumDatabases}`,
        )
        .orderBy(asc(count(logicalDatabases.id)))
        .limit(1);
      if (!cluster)
        return resp.failure(
          "No healthy database cluster has capacity.",
          resp.codes.SYSTEM_MAINTENANCE,
          undefined,
          null,
          undefined,
          503,
        );
      const reservation = await reserveWorkspaceUsage({ workspaceId: workspace.id, code: "databases.count", current: Number(used), quantity: 1, idempotencyKey: `database-create:${randomUUID()}` });
      reservationId = reservation.reservationId;
      if (!reservation.allowed || !reservationId) return resp.failure("Workspace database limit reached.", resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, { quota: reservation }, undefined, 422);
      const suffix = randomBytes(6).toString("hex");
      const databaseName = `q_${workspace.publicId}_${suffix}`;
      const username = `u_${workspace.publicId}_${suffix}`;
      const password = randomBytes(32).toString("base64url");
      const admin = JSON.parse(
        decryptCredential(cluster.cluster.adminCredentialCiphertext),
      ) as ClusterCredential;
      const endpoint = databaseClusterEndpoint(cluster.cluster);
      const provisioner = sharedDatabaseProvisioner(input.engine);
      const created = await provisioner.createLogicalDatabase({
        adminDatabase: admin.database,
        adminPassword: admin.password,
        adminUsername: admin.username,
        connectionLimit: input.connectionLimit,
        databaseName,
        engine: input.engine,
        host: endpoint.host,
        password,
        port: endpoint.port,
        tlsMode: endpoint.tlsMode,
        username,
        workspaceId: workspace.id,
      });
      const record = await db.transaction(async (transaction) => {
        const [resource] = await transaction
          .insert(workspaceResources)
          .values({
            workspaceId: workspace.id,
            provider: "coolify",
            kind: "database",
            name: input.name,
            providerResourceId: `logical:${cluster.cluster.id}:${databaseName}`,
            status: "running",
            metadata: {
              engine: input.engine,
              clusterCode: cluster.cluster.code,
            },
            lastReconciledAt: new Date(),
          })
          .returning({ id: workspaceResources.id });
        const [database] = await transaction
          .insert(logicalDatabases)
          .values({
            workspaceId: workspace.id,
            resourceId: resource.id,
            clusterId: cluster.cluster.id,
            status: "active",
            databaseName,
            username,
            credentialCiphertext: encryptCredential(JSON.stringify(created)),
            storageQuotaMb: input.storageQuotaMb,
            connectionLimit: input.connectionLimit,
            metadata: { displayName: input.name },
          })
          .returning(logicalDatabasePublicFields);
        if (!database) throw new Error("Unable to persist logical database.");
        return composeLogicalDatabaseResponse(database, cluster.cluster);
      });
      await commitUsageReservation(reservationId, "logical_database", record.id);
      await recordAuditLog({
        actorUserId,
        action: "logical_database.created",
        resourceType: "logical_database",
        resourceId: record.id,
        metadata: {
          workspacePublicId,
          engine: input.engine,
          clusterCode: cluster.cluster.code,
        },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        "Database created. Save these credentials now.",
        { database: record, credential: created },
        resp.codes.CREATED,
        undefined,
        201,
      );
    } catch (error) {
      if (reservationId) await releaseUsageReservation(reservationId, error instanceof Error ? error.message : "Database creation failed.");
      return resp.failure(
        error instanceof Error ? error.message : "Database creation failed.",
        resp.codes.INTERNAL_SERVICE_ERROR,
        undefined,
        null,
        undefined,
        500,
      );
    }
  }

  public static async reveal(
    request: Request,
    workspacePublicId: number,
    databaseId: string,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const { actorUserId, workspace } = await workspaceAccess(
        request,
        workspacePublicId,
        metadata,
      );
      const [record] = await db
        .select({
          id: logicalDatabases.id,
          credential: logicalDatabases.credentialCiphertext,
        })
        .from(logicalDatabases)
        .where(
          and(
            eq(logicalDatabases.id, databaseId),
            eq(logicalDatabases.workspaceId, workspace.id),
            isNull(logicalDatabases.deletedAt),
          ),
        )
        .limit(1);
      if (!record)
        return resp.failure(
          "Database not found.",
          resp.codes.RESOURCE_NOT_FOUND,
          undefined,
          null,
          undefined,
          404,
        );
      await recordAuditLog({
        actorUserId,
        action: "logical_database.credential_revealed",
        resourceType: "logical_database",
        resourceId: record.id,
        metadata: { workspacePublicId },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        "Database credential revealed.",
        JSON.parse(decryptCredential(record.credential)),
      );
    } catch {
      return resp.failure(
        "Database not found.",
        resp.codes.RESOURCE_NOT_FOUND,
        undefined,
        null,
        undefined,
        404,
      );
    }
  }

  public static async rotate(
    request: Request,
    workspacePublicId: number,
    databaseId: string,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const { actorUserId, workspace } = await workspaceAccess(
        request,
        workspacePublicId,
        metadata,
      );
      const [record] = await db
        .select({ database: logicalDatabases, cluster: databaseClusters })
        .from(logicalDatabases)
        .innerJoin(
          databaseClusters,
          eq(databaseClusters.id, logicalDatabases.clusterId),
        )
        .where(
          and(
            eq(logicalDatabases.id, databaseId),
            eq(logicalDatabases.workspaceId, workspace.id),
            isNull(logicalDatabases.deletedAt),
          ),
        )
        .limit(1);
      if (!record)
        return resp.failure(
          "Database not found.",
          resp.codes.RESOURCE_NOT_FOUND,
          undefined,
          null,
          undefined,
          404,
        );
      const current = JSON.parse(
        decryptCredential(record.database.credentialCiphertext),
      ) as {
        databaseName: string;
        engine: "mysql" | "postgresql";
        host: string;
        password: string;
        port: number;
        username: string;
      };
      const admin = JSON.parse(
        decryptCredential(record.cluster.adminCredentialCiphertext),
      ) as ClusterCredential;
      const endpoint = databaseClusterEndpoint(record.cluster);
      const password = randomBytes(32).toString("base64url");
      await sharedDatabaseProvisioner(record.cluster.engine).rotateCredential({
        adminDatabase: admin.database,
        adminPassword: admin.password,
        adminUsername: admin.username,
        connectionLimit: record.database.connectionLimit ?? 10,
        databaseName: record.database.databaseName,
        engine: record.cluster.engine,
        host: endpoint.host,
        password,
        port: endpoint.port,
        tlsMode: endpoint.tlsMode,
        username: record.database.username,
        workspaceId: workspace.id,
      });
      const credential = {
        ...current,
        host: endpoint.host,
        password,
        port: endpoint.port,
      };
      await db
        .update(logicalDatabases)
        .set({
          credentialCiphertext: encryptCredential(JSON.stringify(credential)),
          updatedAt: new Date(),
        })
        .where(eq(logicalDatabases.id, record.database.id));
      await recordAuditLog({
        actorUserId,
        action: "logical_database.credential_rotated",
        resourceType: "logical_database",
        resourceId: record.database.id,
        metadata: { workspacePublicId },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        "Database credential rotated. Save it now.",
        credential,
        resp.codes.UPDATED,
      );
    } catch (error) {
      return resp.failure(
        error instanceof Error ? error.message : "Credential rotation failed.",
        resp.codes.INTERNAL_SERVICE_ERROR,
        undefined,
        null,
        undefined,
        500,
      );
    }
  }
}
