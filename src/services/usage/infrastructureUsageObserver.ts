import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@db/client';
import { databaseClusters, logicalDatabases } from '@db/schema';
import { databaseClusterEndpoint } from '@services/databases/databaseClusterEndpointService';
import { sharedDatabaseProvisioner } from '@services/databases/sharedDatabaseProvisionerFactory';
import { decryptCredential } from '@services/encryption/credentialEncryptionService';
import { recordUsageObservation } from '@services/usage/quotaEngine';

interface ClusterCredential { database: string; password: string; username: string }

/** Measures every active logical database and records workspace-aggregated byte observations. */
export async function observeInfrastructureUsage(): Promise<{ databases: number; errors: Array<{ clusterCode: string; databaseName: string; message: string }>; failures: number; workspaces: number }> {
	const rows = await db.select({ workspaceId: logicalDatabases.workspaceId, databaseName: logicalDatabases.databaseName, engine: databaseClusters.engine, cluster: databaseClusters }).from(logicalDatabases).innerJoin(databaseClusters, eq(databaseClusters.id, logicalDatabases.clusterId)).where(and(eq(logicalDatabases.status, 'active'), eq(databaseClusters.status, 'active'), isNull(logicalDatabases.deletedAt), isNull(databaseClusters.deletedAt)));
	const totals = new Map<string, number>(); const errors: Array<{ clusterCode: string; databaseName: string; message: string }> = [];
	for (const row of rows) { try { const credential = JSON.parse(decryptCredential(row.cluster.adminCredentialCiphertext)) as ClusterCredential; const endpoint = databaseClusterEndpoint(row.cluster); const bytes = await sharedDatabaseProvisioner(row.engine).measureLogicalDatabaseBytes({ adminDatabase: credential.database, adminPassword: credential.password, adminUsername: credential.username, databaseName: row.databaseName, host: endpoint.host, port: endpoint.port, tlsMode: endpoint.tlsMode }); totals.set(row.workspaceId, (totals.get(row.workspaceId) ?? 0) + bytes); } catch (error) { errors.push({ clusterCode: row.cluster.code, databaseName: row.databaseName, message: error instanceof Error ? error.message : 'Measurement failed.' }); } }
	const observedAt = new Date(); const staleAfter = new Date(observedAt.getTime() + 6 * 60 * 60 * 1000);
	for (const [workspaceId, value] of totals) await recordUsageObservation({ workspaceId, code: 'databases.storage.bytes', value, unit: 'bytes', source: 'database_engines', observedAt, staleAfter, metadata: { databaseCount: rows.filter((row) => row.workspaceId === workspaceId).length } });
	return { databases: rows.length, errors, failures: errors.length, workspaces: totals.size };
}
