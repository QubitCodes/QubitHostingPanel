import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@db/client';
import { customerCheckouts, customers, paymentAttempts } from '@db/schema';

/** Returns whether a user has ever reached an external payment gateway. */
export async function hasCustomerDashboardAccess(userId: string): Promise<boolean> {
	const [attempt] = await db.select({ id: paymentAttempts.id }).from(customers)
		.innerJoin(customerCheckouts, and(eq(customerCheckouts.customerId, customers.id), isNull(customerCheckouts.deletedAt)))
		.innerJoin(paymentAttempts, and(eq(paymentAttempts.checkoutId, customerCheckouts.id), isNull(paymentAttempts.deletedAt)))
		.where(and(eq(customers.userId, userId), isNull(customers.deletedAt)))
		.limit(1);
	return Boolean(attempt);
}
