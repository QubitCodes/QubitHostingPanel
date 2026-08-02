import { isNull } from 'drizzle-orm';

import { db, getDatabasePool } from '@db/client';
import { users } from '@db/schema';
import { ensureCustomerWorkspaceForUser } from '@services/customerWorkspaceService';

/** Idempotently gives every current user a customer profile and owned Personal Workspace. */
async function run(): Promise<void> {
	const records = await db.select({ id: users.id }).from(users).where(isNull(users.deletedAt));
	for (const record of records) await ensureCustomerWorkspaceForUser(record.id);
	console.log(`Customer/workspace backfill complete for ${records.length} users.`);
	await getDatabasePool().end();
}

void run().catch(async (error: unknown) => {
	console.error(error);
	await getDatabasePool().end();
	process.exitCode = 1;
});
