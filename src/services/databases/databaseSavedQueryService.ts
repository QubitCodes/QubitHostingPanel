import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@db/client';
import { databaseSavedQueries } from '@db/schema';
import { decryptCredential } from '@services/encryption/credentialEncryptionService';

/** Records a saved-query execution only when the submitted SQL still matches its encrypted source. */
export async function markSavedQueryExecuted(actorUserId: string, workspaceId: string, databaseId: string, savedQueryId: string, query: string): Promise<void> {
	const [record] = await db.select().from(databaseSavedQueries).where(and(eq(databaseSavedQueries.id, savedQueryId), eq(databaseSavedQueries.workspaceId, workspaceId), eq(databaseSavedQueries.logicalDatabaseId, databaseId), eq(databaseSavedQueries.ownerUserId, actorUserId), isNull(databaseSavedQueries.deletedAt))).limit(1);
	if (!record || decryptCredential(record.queryCiphertext) !== query) return;
	await db.update(databaseSavedQueries).set({ executionCount: sql`${databaseSavedQueries.executionCount} + 1`, lastExecutedAt: new Date(), updatedAt: new Date() }).where(eq(databaseSavedQueries.id, record.id));
}
