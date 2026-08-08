import { randomBytes } from 'node:crypto';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import {
	customers,
	databaseClusters,
	databaseUserGrants,
	databaseUsers,
	logicalDatabases,
	workspaceMemberships,
	workspaces,
	workspaceSubscriptions,
} from '@db/schema';
import type {
	CreateDatabaseAccessRequest,
	DatabaseUserActionRequest,
	RevokeDatabaseGrantRequest,
	UpdateDatabaseGrantRequest,
} from '@schemas/databaseAccess';
import { recordAuditLog } from '@services/auditLogService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { authenticationFailureResponse } from '@services/auth/authenticationFailureService';
import {
	DatabaseAccessService,
	type DatabaseAdminConnection,
	type DatabaseGrantDefinition,
} from '@services/databases/databaseAccessService';
import { databaseClusterEndpoint } from '@services/databases/databaseClusterEndpointService';
import { decryptCredential, encryptCredential } from '@services/encryption/credentialEncryptionService';
import { workspaceDatabaseIdentifier } from '@utils/databaseIdentifier';
import type { RequestMetadata } from '@utils/request';

interface AccessContext {
	actorUserId: string;
	cluster: typeof databaseClusters.$inferSelect;
	database: typeof logicalDatabases.$inferSelect;
	workspaceId: string;
}

interface UserImpact {
	activeGrantCount: number;
	databaseCount: number;
	ownedDatabaseCount: number;
}

/** Resolves a customer-authorized logical database and its active cluster. */
async function accessContext(
	request: Request,
	workspacePublicId: number,
	databaseId: string,
	metadata: RequestMetadata,
): Promise<AccessContext> {
	const actor = await authenticateSession(request, metadata);
	const [record] = await db
		.select({ cluster: databaseClusters, database: logicalDatabases, workspaceId: workspaces.id })
		.from(customers)
		.innerJoin(workspaceMemberships, and(
			eq(workspaceMemberships.customerId, customers.id),
			eq(workspaceMemberships.status, 'active'),
			isNull(workspaceMemberships.deletedAt),
		))
		.innerJoin(workspaces, and(
			eq(workspaces.id, workspaceMemberships.workspaceId),
			eq(workspaces.publicId, workspacePublicId),
			eq(workspaces.status, 'active'),
			isNull(workspaces.deletedAt),
		))
		.innerJoin(workspaceSubscriptions, and(
			eq(workspaceSubscriptions.workspaceId, workspaces.id),
			eq(workspaceSubscriptions.isPrimary, true),
			sql`${workspaceSubscriptions.status} IN ('active', 'trialing')`,
			isNull(workspaceSubscriptions.deletedAt),
		))
		.innerJoin(logicalDatabases, and(
			eq(logicalDatabases.workspaceId, workspaces.id),
			eq(logicalDatabases.id, databaseId),
			eq(logicalDatabases.status, 'active'),
			isNull(logicalDatabases.deletedAt),
		))
		.innerJoin(databaseClusters, and(
			eq(databaseClusters.id, logicalDatabases.clusterId),
			eq(databaseClusters.status, 'active'),
			isNull(databaseClusters.deletedAt),
		))
		.where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt)))
		.limit(1);
	if (!record) throw new Error('Database not found.');
	return { ...record, actorUserId: actor.userId };
}

/** Decrypts only the cluster administrator material needed for one operation. */
function adminConnection(context: AccessContext): DatabaseAdminConnection {
	const admin = JSON.parse(decryptCredential(context.cluster.adminCredentialCiphertext)) as {
		database: string;
		password: string;
		username: string;
	};
	const endpoint = databaseClusterEndpoint(context.cluster);
	return {
		adminDatabase: admin.database,
		adminPassword: admin.password,
		adminUsername: admin.username,
		databaseName: context.database.databaseName,
		engine: context.cluster.engine,
		host: endpoint.host,
		ownerUsername: context.database.username,
		port: endpoint.port,
		tlsMode: endpoint.tlsMode,
	};
}

/** Converts validated API access settings into the engine-neutral grant contract. */
function grantDefinition(
	input: Pick<CreateDatabaseAccessRequest, 'accessLevel' | 'privileges' | 'scopes'>,
): DatabaseGrantDefinition {
	return { accessLevel: input.accessLevel, privileges: input.privileges, scopes: input.scopes };
}

/** Counts every active database relationship affected by a cluster-level user action. */
async function userImpact(databaseUserId: string): Promise<UserImpact> {
	const [owned, granted] = await Promise.all([
		db.select({ id: logicalDatabases.id }).from(logicalDatabases).where(and(
			eq(logicalDatabases.databaseUserId, databaseUserId),
			isNull(logicalDatabases.deletedAt),
		)),
		db.select({ id: databaseUserGrants.logicalDatabaseId }).from(databaseUserGrants).where(and(
			eq(databaseUserGrants.databaseUserId, databaseUserId),
			eq(databaseUserGrants.status, 'active'),
			isNull(databaseUserGrants.deletedAt),
		)),
	]);
	return {
		activeGrantCount: granted.length,
		databaseCount: new Set([...owned.map(({ id }) => id), ...granted.map(({ id }) => id)]).size,
		ownedDatabaseCount: owned.length,
	};
}

/** Updates every encrypted connection copy after a shared user's password changes. */
async function persistRotatedPassword(databaseUserId: string, password: string): Promise<void> {
	const [user] = await db.select().from(databaseUsers).where(eq(databaseUsers.id, databaseUserId)).limit(1);
	if (!user) throw new Error('Database user not found.');
	const currentUserCredential = JSON.parse(decryptCredential(user.credentialCiphertext)) as Record<string, unknown>;
	const linkedDatabases = await db.select().from(logicalDatabases).where(and(
		eq(logicalDatabases.databaseUserId, databaseUserId),
		isNull(logicalDatabases.deletedAt),
	));
	await db.transaction(async (transaction) => {
		await transaction.update(databaseUsers).set({
			credentialCiphertext: encryptCredential(JSON.stringify({ ...currentUserCredential, password })),
			updatedAt: new Date(),
		}).where(eq(databaseUsers.id, databaseUserId));
		for (const database of linkedDatabases) {
			const credential = JSON.parse(decryptCredential(database.credentialCiphertext)) as Record<string, unknown>;
			await transaction.update(logicalDatabases).set({
				credentialCiphertext: encryptCredential(JSON.stringify({ ...credential, password })),
				updatedAt: new Date(),
			}).where(eq(logicalDatabases.id, database.id));
		}
	});
}

/** Customer lifecycle for additional logical-database users and grants. */
export class DatabaseAccessController {
	/** Lists owner/additional grants and reusable users without exposing secrets. */
	public static async index(
		request: Request,
		workspacePublicId: number,
		databaseId: string,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const context = await accessContext(request, workspacePublicId, databaseId, metadata);
			const grants = await db
				.select({ grant: databaseUserGrants, user: databaseUsers })
				.from(databaseUserGrants)
				.innerJoin(databaseUsers, and(
					eq(databaseUsers.id, databaseUserGrants.databaseUserId),
					isNull(databaseUsers.deletedAt),
				))
				.where(and(
					eq(databaseUserGrants.logicalDatabaseId, databaseId),
					eq(databaseUserGrants.workspaceId, context.workspaceId),
					isNull(databaseUserGrants.deletedAt),
				))
				.orderBy(databaseUserGrants.createdAt);
			const assignedUserIds = grants
				.filter(({ grant }) => grant.status === 'active')
				.map(({ user }) => user.id);
			const availableFilters = [
				eq(databaseUsers.workspaceId, context.workspaceId),
				eq(databaseUsers.clusterId, context.cluster.id),
				eq(databaseUsers.status, 'active'),
				isNull(databaseUsers.deletedAt),
			];
			if (assignedUserIds.length) availableFilters.push(notInArray(databaseUsers.id, assignedUserIds));
			const availableUsers = await db
				.select({ id: databaseUsers.id, username: databaseUsers.username, status: databaseUsers.status })
				.from(databaseUsers)
				.where(and(...availableFilters))
				.orderBy(databaseUsers.username);
			const impacts = await Promise.all(grants.map(async ({ user }) => [user.id, await userImpact(user.id)] as const));
			await recordAuditLog({
				actorUserId: context.actorUserId,
				action: 'logical_database.access_viewed',
				resourceType: 'logical_database',
				resourceId: databaseId,
				metadata: { workspacePublicId, grantCount: grants.length },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Database access retrieved.', {
				availableUsers,
				grants: grants.map(({ grant, user }) => ({
					...grant,
					impact: impacts.find(([id]) => id === user.id)?.[1],
					user: { id: user.id, status: user.status, username: user.username },
				})),
				usernamePrefix: `w${workspacePublicId}_`,
			});
		} catch (error) {
			return authenticationFailureResponse(error) ?? resp.failure(
				'Database not found.',
				resp.codes.RESOURCE_NOT_FOUND,
				undefined,
				null,
				undefined,
				404,
			);
		}
	}

	/** Creates or reuses a cluster login and grants it access to this database. */
	public static async create(
		request: Request,
		workspacePublicId: number,
		databaseId: string,
		input: CreateDatabaseAccessRequest,
		metadata: RequestMetadata,
	): Promise<Response> {
		let rollback: { context: AccessContext; isNew: boolean; username: string } | undefined;
		try {
			const context = await accessContext(request, workspacePublicId, databaseId, metadata);
			const [existing] = input.userMode === 'existing' && input.databaseUserId
				? await db.select().from(databaseUsers).where(and(
					eq(databaseUsers.id, input.databaseUserId),
					eq(databaseUsers.workspaceId, context.workspaceId),
					eq(databaseUsers.clusterId, context.cluster.id),
					eq(databaseUsers.status, 'active'),
					isNull(databaseUsers.deletedAt),
				)).limit(1)
				: [];
			if (input.userMode === 'existing' && !existing) return resp.failure(
				'Database user not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404,
			);

			const username = existing?.username ?? workspaceDatabaseIdentifier(workspacePublicId, input.username ?? 'user');
			if (!existing) {
				const [sameUsername] = await db.select({ id: databaseUsers.id }).from(databaseUsers).where(and(
					eq(databaseUsers.clusterId, context.cluster.id),
					eq(databaseUsers.username, username),
					isNull(databaseUsers.deletedAt),
				)).limit(1);
				if (sameUsername) return resp.failure(
					'Database username is already in use.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409,
				);
			}
			if (existing) {
				const [duplicate] = await db.select({ id: databaseUserGrants.id }).from(databaseUserGrants).where(and(
					eq(databaseUserGrants.logicalDatabaseId, databaseId),
					eq(databaseUserGrants.databaseUserId, existing.id),
					eq(databaseUserGrants.status, 'active'),
					isNull(databaseUserGrants.deletedAt),
				)).limit(1);
				if (duplicate) return resp.failure(
					'This user already has access.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409,
				);
			}

			const service = new DatabaseAccessService(adminConnection(context));
			const endpoint = databaseClusterEndpoint(context.cluster);
			const password = existing ? undefined : input.password ?? randomBytes(32).toString('base64url');
			if (!existing && password) await service.createUser(username, password);
			rollback = { context, isNew: !existing, username };
			await service.apply(username, grantDefinition(input));
			const result = await db.transaction(async (transaction) => {
				const databaseUserId = existing?.id ?? (await transaction.insert(databaseUsers).values({
					workspaceId: context.workspaceId,
					clusterId: context.cluster.id,
					username,
					credentialCiphertext: encryptCredential(JSON.stringify({
						databaseName: context.database.databaseName,
						engine: context.cluster.engine,
						host: endpoint.host,
						password,
						port: endpoint.port,
						tlsMode: endpoint.tlsMode,
						username,
					})),
				}).returning({ id: databaseUsers.id }))[0]?.id;
				if (!databaseUserId) throw new Error('Unable to persist database user.');
				const [grant] = await transaction.insert(databaseUserGrants).values({
					workspaceId: context.workspaceId,
					logicalDatabaseId: databaseId,
					databaseUserId,
					accessLevel: input.accessLevel,
					privileges: input.privileges,
					scopes: input.scopes,
					expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
					grantedByUserId: context.actorUserId,
				}).returning();
				return { databaseUserId, grant };
			});
			rollback = undefined;
			await recordAuditLog({
				actorUserId: context.actorUserId,
				action: 'logical_database.access_granted',
				resourceType: 'database_user_grant',
				resourceId: result.grant?.id,
				metadata: {
					accessLevel: input.accessLevel,
					databaseId,
					databaseUserId: result.databaseUserId,
					expiresAt: input.expiresAt ?? null,
					workspacePublicId,
				},
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Database access granted.', {
				credential: existing ? undefined : {
					databaseName: context.database.databaseName,
					engine: context.cluster.engine,
					host: endpoint.host,
					password,
					port: endpoint.port,
					username,
				},
				grant: result.grant,
			}, resp.codes.CREATED, undefined, 201);
		} catch (error) {
			if (rollback) {
				const service = new DatabaseAccessService(adminConnection(rollback.context));
				await (rollback.isNew ? service.deleteUser(rollback.username) : service.revoke(rollback.username)).catch(() => undefined);
			}
			return authenticationFailureResponse(error) ?? resp.failure(
				error instanceof Error ? error.message : 'Unable to grant database access.',
				resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
				undefined,
				null,
				undefined,
				422,
			);
		}
	}

	/** Replaces a non-owner grant after successfully applying provider permissions. */
	public static async update(
		request: Request,
		workspacePublicId: number,
		databaseId: string,
		grantId: string,
		input: UpdateDatabaseGrantRequest,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const context = await accessContext(request, workspacePublicId, databaseId, metadata);
			const [record] = await db
				.select({ grant: databaseUserGrants, user: databaseUsers })
				.from(databaseUserGrants)
				.innerJoin(databaseUsers, eq(databaseUsers.id, databaseUserGrants.databaseUserId))
				.where(and(
					eq(databaseUserGrants.id, grantId),
					eq(databaseUserGrants.logicalDatabaseId, databaseId),
					eq(databaseUserGrants.status, 'active'),
					isNull(databaseUserGrants.deletedAt),
					isNull(databaseUsers.deletedAt),
				)).limit(1);
			if (!record) return resp.failure(
				'Database grant not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404,
			);
			if (record.grant.accessLevel === 'owner') return resp.failure(
				'Owner access cannot be changed here.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, null, undefined, 422,
			);
			await new DatabaseAccessService(adminConnection(context)).apply(record.user.username, grantDefinition(input));
			const [updated] = await db.update(databaseUserGrants).set({
				accessLevel: input.accessLevel,
				privileges: input.privileges,
				scopes: input.scopes,
				expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
				updatedAt: new Date(),
			}).where(eq(databaseUserGrants.id, grantId)).returning();
			await recordAuditLog({
				actorUserId: context.actorUserId,
				action: 'logical_database.access_updated',
				resourceType: 'database_user_grant',
				resourceId: grantId,
				metadata: { accessLevel: input.accessLevel, databaseId, workspacePublicId },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Database access updated.', updated, resp.codes.UPDATED);
		} catch (error) {
			return authenticationFailureResponse(error) ?? resp.failure(
				error instanceof Error ? error.message : 'Unable to update access.',
				resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
				undefined,
				null,
				undefined,
				422,
			);
		}
	}

	/** Revokes one non-owner grant after exact username confirmation. */
	public static async revoke(
		request: Request,
		workspacePublicId: number,
		databaseId: string,
		grantId: string,
		input: RevokeDatabaseGrantRequest,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const context = await accessContext(request, workspacePublicId, databaseId, metadata);
			const [record] = await db
				.select({ grant: databaseUserGrants, user: databaseUsers })
				.from(databaseUserGrants)
				.innerJoin(databaseUsers, eq(databaseUsers.id, databaseUserGrants.databaseUserId))
				.where(and(
					eq(databaseUserGrants.id, grantId),
					eq(databaseUserGrants.logicalDatabaseId, databaseId),
					eq(databaseUserGrants.status, 'active'),
					isNull(databaseUserGrants.deletedAt),
					isNull(databaseUsers.deletedAt),
				)).limit(1);
			if (!record) return resp.failure(
				'Database grant not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404,
			);
			if (record.grant.accessLevel === 'owner') return resp.failure(
				'Owner access cannot be revoked here.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, null, undefined, 422,
			);
			if (input.confirmation !== record.user.username) return resp.failure(
				'Confirmation must match the username.', resp.codes.VALIDATION_ERROR, undefined, null, undefined, 400,
			);
			await new DatabaseAccessService(adminConnection(context)).revoke(record.user.username);
			const now = new Date();
			await db.update(databaseUserGrants).set({
				revokeReason: input.reason,
				revokedAt: now,
				revokedByUserId: context.actorUserId,
				status: 'revoked',
				updatedAt: now,
			}).where(eq(databaseUserGrants.id, grantId));
			await recordAuditLog({
				actorUserId: context.actorUserId,
				action: 'logical_database.access_revoked',
				resourceType: 'database_user_grant',
				resourceId: grantId,
				metadata: { databaseId, reason: input.reason, workspacePublicId },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Database access revoked.', { id: grantId }, resp.codes.UPDATED);
		} catch (error) {
			return authenticationFailureResponse(error) ?? resp.failure(
				error instanceof Error ? error.message : 'Unable to revoke access.',
				resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
				undefined,
				null,
				undefined,
				422,
			);
		}
	}

	/** Reveals, rotates, suspends, restores, or deletes a reusable cluster login. */
	public static async userAction(
		request: Request,
		workspacePublicId: number,
		databaseId: string,
		databaseUserId: string,
		input: DatabaseUserActionRequest,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const context = await accessContext(request, workspacePublicId, databaseId, metadata);
			const [user] = await db.select().from(databaseUsers).where(and(
				eq(databaseUsers.id, databaseUserId),
				eq(databaseUsers.workspaceId, context.workspaceId),
				eq(databaseUsers.clusterId, context.cluster.id),
				isNull(databaseUsers.deletedAt),
			)).limit(1);
			if (!user) return resp.failure(
				'Database user not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404,
			);
			if (input.confirmation !== user.username) return resp.failure(
				'Confirmation must match the username.', resp.codes.VALIDATION_ERROR, undefined, null, undefined, 400,
			);
			const impact = await userImpact(user.id);
			const service = new DatabaseAccessService(adminConnection(context));
			let responseData: Record<string, unknown> = { id: user.id, impact };

			if (input.action === 'reveal') {
				const credential = JSON.parse(decryptCredential(user.credentialCiphertext)) as Record<string, unknown>;
				responseData = { ...credential, databaseName: context.database.databaseName };
			} else if (input.action === 'rotate') {
				const password = input.password ?? randomBytes(32).toString('base64url');
				await service.rotate(user.username, password);
				await persistRotatedPassword(user.id, password);
				const credential = JSON.parse(decryptCredential(user.credentialCiphertext)) as Record<string, unknown>;
				responseData = { ...credential, databaseName: context.database.databaseName, password };
			} else if (input.action === 'delete') {
				if (impact.ownedDatabaseCount || impact.activeGrantCount) return resp.failure(
					'Revoke every grant and transfer any owned database before deleting this user.',
					resp.codes.ORDER_CANNOT_BE_PROCESSED,
					undefined,
					impact,
					undefined,
					422,
				);
				await service.deleteUser(user.username);
				const now = new Date();
				await db.update(databaseUsers).set({
					deletedAt: now,
					deleteReason: input.reason ?? 'Deleted by workspace user.',
					status: 'suspended',
					updatedAt: now,
				}).where(eq(databaseUsers.id, user.id));
			} else {
				const enabled = input.action === 'restore';
				await service.setEnabled(user.username, enabled);
				await db.update(databaseUsers).set({
					status: enabled ? 'active' : 'suspended',
					updatedAt: new Date(),
				}).where(eq(databaseUsers.id, user.id));
			}

			await recordAuditLog({
				actorUserId: context.actorUserId,
				action: input.action === 'reveal' ? 'database_user.credential_revealed' : `database_user.${input.action}`,
				resourceType: 'database_user',
				resourceId: user.id,
				metadata: { databaseId, ...impact, reason: input.reason ?? null, workspacePublicId },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			const message = input.action === 'reveal'
				? 'Database user credential revealed.'
				: input.action === 'rotate'
					? 'Database user password rotated.'
					: `Database user ${input.action} completed.`;
			return resp.success(message, responseData, input.action === 'reveal' ? resp.codes.OK : resp.codes.UPDATED);
		} catch (error) {
			return authenticationFailureResponse(error) ?? resp.failure(
				error instanceof Error ? error.message : 'Database user action failed.',
				resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
				undefined,
				null,
				undefined,
				422,
			);
		}
	}
}
