import { and, eq, isNull, lte } from 'drizzle-orm';

import { db } from '@db/client';
import { databaseClusters, databaseUserGrants, databaseUsers, logicalDatabases } from '@db/schema';
import { recordAuditLog } from '@services/auditLogService';
import { DatabaseAccessService } from '@services/databases/databaseAccessService';
import { databaseClusterEndpoint } from '@services/databases/databaseClusterEndpointService';
import { decryptCredential } from '@services/encryption/credentialEncryptionService';

/** Revokes expired database grants at the engine before marking them inactive locally. */
export async function expireDatabaseGrants(limit = 50): Promise<{
	failed: Array<{ grantId: string; reason: string }>;
	processed: number;
	revoked: number;
}> {
	const due = await db
		.select({
			cluster: databaseClusters,
			database: logicalDatabases,
			grant: databaseUserGrants,
			user: databaseUsers,
		})
		.from(databaseUserGrants)
		.innerJoin(databaseUsers, and(
			eq(databaseUsers.id, databaseUserGrants.databaseUserId),
			isNull(databaseUsers.deletedAt),
		))
		.innerJoin(logicalDatabases, and(
			eq(logicalDatabases.id, databaseUserGrants.logicalDatabaseId),
			isNull(logicalDatabases.deletedAt),
		))
		.innerJoin(databaseClusters, and(
			eq(databaseClusters.id, logicalDatabases.clusterId),
			isNull(databaseClusters.deletedAt),
		))
		.where(and(
			eq(databaseUserGrants.status, 'active'),
			lte(databaseUserGrants.expiresAt, new Date()),
			isNull(databaseUserGrants.deletedAt),
		))
		.limit(limit);
	const failed: Array<{ grantId: string; reason: string }> = [];
	let revoked = 0;
	for (const record of due) {
		try {
			if (record.grant.accessLevel === 'owner') throw new Error('Owner access cannot expire automatically.');
			const admin = JSON.parse(decryptCredential(record.cluster.adminCredentialCiphertext)) as {
				database: string;
				password: string;
				username: string;
			};
			const endpoint = databaseClusterEndpoint(record.cluster);
			await new DatabaseAccessService({
				adminDatabase: admin.database,
				adminPassword: admin.password,
				adminUsername: admin.username,
				databaseName: record.database.databaseName,
				engine: record.cluster.engine,
				host: endpoint.host,
				ownerUsername: record.database.username,
				port: endpoint.port,
				tlsMode: endpoint.tlsMode,
			}).revoke(record.user.username);
			const now = new Date();
			await db.update(databaseUserGrants).set({
				revokeReason: 'Access grant expired.',
				revokedAt: now,
				status: 'revoked',
				updatedAt: now,
			}).where(and(
				eq(databaseUserGrants.id, record.grant.id),
				eq(databaseUserGrants.status, 'active'),
			));
			if (record.grant.grantedByUserId) await recordAuditLog({
				actorUserId: record.grant.grantedByUserId,
				action: 'logical_database.access_expired',
				resourceType: 'database_user_grant',
				resourceId: record.grant.id,
				metadata: { automated: true, logicalDatabaseId: record.database.id },
			});
			revoked += 1;
		} catch (error) {
			if (record.grant.grantedByUserId) await recordAuditLog({
				actorUserId: record.grant.grantedByUserId,
				action: 'logical_database.access_expiry_failed',
				resourceType: 'database_user_grant',
				resourceId: record.grant.id,
				metadata: { automated: true, logicalDatabaseId: record.database.id, reason: error instanceof Error ? error.message : 'Unknown failure.' },
			}).catch(() => undefined);
			failed.push({
				grantId: record.grant.id,
				reason: error instanceof Error ? error.message : 'Unknown database grant expiry failure.',
			});
		}
	}
	return { failed, processed: due.length, revoked };
}
