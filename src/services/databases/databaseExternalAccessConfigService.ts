import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@db/client';
import { databaseClusters, databaseExternalAccessRules, logicalDatabases } from '@db/schema';

export interface DatabaseGatewayTarget {
	allowedCidrs: string[];
	databaseId: string;
	engine: 'mysql' | 'postgresql';
	expiresAt: string | null;
	gatewayPort: number;
	providerDatabaseUuid: string;
	revision: string;
	ruleId: string;
	targetPort: number;
}

/** Returns the least-privilege host-agent contract; it contains no database or cluster credentials. */
export async function databaseExternalAccessConfig(): Promise<{ enabled: boolean; revision: string; targets: DatabaseGatewayTarget[] }> {
	const now = new Date();
	await db.update(databaseExternalAccessRules).set({ status: 'revoked', deletedAt: now, deleteReason: 'External-access policy expired.', updatedAt: now }).where(and(sql`${databaseExternalAccessRules.expiresAt} <= ${now}`, isNull(databaseExternalAccessRules.deletedAt), inArray(databaseExternalAccessRules.status, ['pending', 'active', 'failed'])));
	const rows = await db.select({ rule: databaseExternalAccessRules, databaseId: logicalDatabases.id, engine: databaseClusters.engine, providerDatabaseUuid: databaseClusters.providerResourceId, targetPort: databaseClusters.port })
		.from(databaseExternalAccessRules)
		.innerJoin(logicalDatabases, and(eq(logicalDatabases.id, databaseExternalAccessRules.logicalDatabaseId), eq(logicalDatabases.status, 'active'), isNull(logicalDatabases.deletedAt)))
		.innerJoin(databaseClusters, and(eq(databaseClusters.id, logicalDatabases.clusterId), eq(databaseClusters.status, 'active'), isNull(databaseClusters.deletedAt)))
		.where(and(inArray(databaseExternalAccessRules.status, ['pending', 'active', 'failed']), isNull(databaseExternalAccessRules.deletedAt), or(isNull(databaseExternalAccessRules.expiresAt), sql`${databaseExternalAccessRules.expiresAt} > ${now}`)));
	const targets = rows.map(({ databaseId, engine, providerDatabaseUuid, rule, targetPort }) => ({ allowedCidrs: rule.allowedCidrs, databaseId, engine, expiresAt: rule.expiresAt?.toISOString() ?? null, gatewayPort: rule.gatewayPort, providerDatabaseUuid, revision: rule.revision ?? '', ruleId: rule.id, targetPort })).sort((left, right) => left.gatewayPort - right.gatewayPort);
	const revision = createHash('sha256').update(JSON.stringify(targets)).digest('hex').slice(0, 24);
	return { enabled: true, revision, targets };
}

/** Records only a matching host-agent application result so stale acknowledgements cannot activate new policy. */
export async function acknowledgeDatabaseExternalAccess(results: Array<{ failureReason?: string; revision: string; ruleId: string; success: boolean }>): Promise<void> {
	for (const result of results) {
		await db.update(databaseExternalAccessRules).set({ status: result.success ? 'active' : 'failed', failureReason: result.success ? null : result.failureReason?.slice(0, 1000) || 'Gateway reconciliation failed.', lastSyncedAt: new Date(), updatedAt: new Date() }).where(and(eq(databaseExternalAccessRules.id, result.ruleId), eq(databaseExternalAccessRules.revision, result.revision), isNull(databaseExternalAccessRules.deletedAt)));
	}
}
