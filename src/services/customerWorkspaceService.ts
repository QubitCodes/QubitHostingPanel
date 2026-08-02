import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@db/client';
import { customers, users } from '@db/schema';

export type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Ensures the authenticated identity has a customer profile without creating a workspace. */
export async function ensureCustomer(transaction: DatabaseTransaction, userId: string): Promise<{ customerId: string }> {
	await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
	const [user] = await transaction.select({ id: users.id }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
	if (!user) throw new Error('User not found while provisioning customer profile.');
	let [customer] = await transaction.select({ id: customers.id }).from(customers).where(and(eq(customers.userId, user.id), isNull(customers.deletedAt))).limit(1);
	if (!customer) [customer] = await transaction.insert(customers).values({ userId: user.id }).returning({ id: customers.id });
	if (!customer) throw new Error('Unable to create customer profile.');
	return { customerId: customer.id };
}

/** Provisions only the customer profile for one user in its own transaction. */
export function ensureCustomerForUser(userId: string): Promise<{ customerId: string }> {
	return db.transaction((transaction) => ensureCustomer(transaction, userId));
}
