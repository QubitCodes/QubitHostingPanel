import { and, asc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { customers, organisations, packages, workspaceMemberships, workspaces, workspaceSubscriptions } from '@db/schema';
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
	packageName: packages.name,
	termEndsAt: workspaceSubscriptions.termEndsAt,
	trialEndsAt: workspaceSubscriptions.trialEndsAt,
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
			const [workspace] = await db.select(workspaceProjection).from(customers)
				.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
				.innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, publicId), eq(workspaces.status, 'active'), isNull(workspaces.deletedAt)))
				.leftJoin(organisations, and(eq(organisations.workspaceId, workspaces.id), isNull(organisations.deletedAt)))
				.leftJoin(workspaceSubscriptions, and(eq(workspaceSubscriptions.workspaceId, workspaces.id), isNull(workspaceSubscriptions.deletedAt)))
				.leftJoin(packages, eq(packages.id, workspaceSubscriptions.packageId))
				.where(and(eq(customers.userId, authenticated.userId), isNull(customers.deletedAt)))
				.limit(1);
			if (!workspace) return resp.failure('Workspace not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			return resp.success('Workspace retrieved.', workspace);
		} catch {
			return resp.failure('Authentication required.', resp.codes.AUTHENTICATION_ERROR, undefined, null, undefined, 401);
		}
	}
}
