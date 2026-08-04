import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { customers, organisations, packages, paymentAttempts, workspaceMemberships, workspaces, workspaceSubscriptions } from '@db/schema';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import type { RequestMetadata } from '@utils/request';

const workspaceProjection = {
	id: workspaces.id,
	publicId: workspaces.publicId,
	name: workspaces.name,
	slug: workspaces.slug,
	type: workspaces.type,
	status: workspaces.status,
	role: workspaceMemberships.role,
	organisationDisplayName: organisations.displayName,
	subscriptionStatus: workspaceSubscriptions.status,
	cancelAtPeriodEnd: workspaceSubscriptions.cancelAtPeriodEnd,
	packageName: packages.name,
	termEndsAt: workspaceSubscriptions.termEndsAt,
	trialEndsAt: workspaceSubscriptions.trialEndsAt,
};

const workspaceDetailProjection = {
	...workspaceProjection,
	subscriptionId: workspaceSubscriptions.id,
	checkoutId: workspaceSubscriptions.checkoutId,
	packageSnapshot: workspaceSubscriptions.packageSnapshot,
	entitlementSnapshot: workspaceSubscriptions.entitlementSnapshot,
	startsAt: workspaceSubscriptions.startsAt,
};

/** Customer-authorized workspace reads for the User Panel. */
export class WorkspaceController {
	public static async index(request: Request, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const rows = await db.select(workspaceProjection).from(customers)
				.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
				.innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.status, 'active'), isNull(workspaces.deletedAt)))
				.leftJoin(organisations, and(eq(organisations.workspaceId, workspaces.id), isNull(organisations.deletedAt)))
				.leftJoin(workspaceSubscriptions, and(eq(workspaceSubscriptions.workspaceId, workspaces.id), isNull(workspaceSubscriptions.deletedAt)))
				.leftJoin(packages, eq(packages.id, workspaceSubscriptions.packageId))
				.where(and(eq(customers.userId, authenticated.userId), isNull(customers.deletedAt)))
				.orderBy(asc(workspaces.createdAt));
			return resp.success('Workspaces retrieved.', rows);
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}

	public static async show(request: Request, publicId: number, metadata: RequestMetadata): Promise<Response> {
		try {
			const authenticated = await authenticateSession(request, metadata);
			const [workspace] = await db.select(workspaceDetailProjection).from(customers)
				.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
				.innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, publicId), eq(workspaces.status, 'active'), isNull(workspaces.deletedAt)))
				.leftJoin(organisations, and(eq(organisations.workspaceId, workspaces.id), isNull(organisations.deletedAt)))
				.leftJoin(workspaceSubscriptions, and(eq(workspaceSubscriptions.workspaceId, workspaces.id), isNull(workspaceSubscriptions.deletedAt)))
				.leftJoin(packages, eq(packages.id, workspaceSubscriptions.packageId))
				.where(and(eq(customers.userId, authenticated.userId), isNull(customers.deletedAt)))
				.limit(1);
			if (!workspace) return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const payments = workspace.checkoutId ? await db.select({
				id: paymentAttempts.id,
				provider: paymentAttempts.provider,
				status: paymentAttempts.status,
				amountMinor: paymentAttempts.amountMinor,
				currency: paymentAttempts.currency,
				providerPaymentId: paymentAttempts.providerPaymentId,
				failureMessage: paymentAttempts.failureMessage,
				createdAt: paymentAttempts.createdAt,
				verifiedAt: paymentAttempts.verifiedAt,
			}).from(paymentAttempts).where(and(eq(paymentAttempts.checkoutId, workspace.checkoutId), isNull(paymentAttempts.deletedAt))).orderBy(desc(paymentAttempts.createdAt)) : [];
			return resp.success('Workspace retrieved.', { ...workspace, payments });
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}
}
