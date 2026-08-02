import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@db/client';
import { customers, users, workspaceMemberships, workspaces } from '@db/schema';

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ProvisionedCustomerWorkspace {
	customerId: string;
	workspaceId: string;
	workspacePublicId: number;
}

/** Ensures one customer profile and at least one owned Personal Workspace inside the caller transaction. */
export async function ensureCustomerWorkspace(transaction: DatabaseTransaction, userId: string): Promise<ProvisionedCustomerWorkspace> {
	await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
	const [user] = await transaction.select({ id: users.id, publicId: users.publicId, displayName: users.displayName, mobile: users.mobile }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
	if (!user) throw new Error('User not found while provisioning customer workspace.');

	let [customer] = await transaction.select().from(customers).where(and(eq(customers.userId, user.id), isNull(customers.deletedAt))).limit(1);
	if (!customer) {
		[customer] = await transaction.insert(customers).values({ userId: user.id }).returning();
	}
	if (!customer) throw new Error('Unable to create customer profile.');

	const [ownedWorkspace] = await transaction.select({ id: workspaces.id, publicId: workspaces.publicId }).from(workspaceMemberships)
		.innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
		.where(and(
			eq(workspaceMemberships.customerId, customer.id),
			eq(workspaceMemberships.role, 'owner'),
			eq(workspaceMemberships.status, 'active'),
			isNull(workspaceMemberships.deletedAt),
			isNull(workspaces.deletedAt),
		)).limit(1);
	if (ownedWorkspace) return { customerId: customer.id, workspaceId: ownedWorkspace.id, workspacePublicId: ownedWorkspace.publicId };

	const workspaceName = user.displayName?.trim() ? `${user.displayName.trim()}'s Workspace` : `Workspace ${user.publicId}`;
	const [workspace] = await transaction.insert(workspaces).values({
		name: workspaceName,
		slug: `personal-${user.publicId}`,
		type: 'personal',
	}).returning({ id: workspaces.id, publicId: workspaces.publicId });
	if (!workspace) throw new Error('Unable to create Personal Workspace.');
	const now = new Date();
	await transaction.insert(workspaceMemberships).values({
		workspaceId: workspace.id,
		customerId: customer.id,
		role: 'owner',
		status: 'active',
		joinedAt: now,
		ownershipStartedAt: now,
	});
	return { customerId: customer.id, workspaceId: workspace.id, workspacePublicId: workspace.publicId };
}

/** Provisions the customer/workspace foundation for one user in its own transaction. */
export function ensureCustomerWorkspaceForUser(userId: string): Promise<ProvisionedCustomerWorkspace> {
	return db.transaction((transaction) => ensureCustomerWorkspace(transaction, userId));
}
