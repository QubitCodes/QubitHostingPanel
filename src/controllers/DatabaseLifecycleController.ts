import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, count, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { getEnvironment } from '@config/env';
import {
	applicationBuilds,
	applicationDatabaseBindings,
	customers,
	databaseBackups,
	databaseBackupSchedules,
	databaseClusters,
	databaseExternalAccessRules,
	databaseSavedQueries,
	databaseTransferJobs,
	databaseUserGrants,
	databaseUsers,
	logicalDatabases,
	workspaceMemberships,
	workspaceResources,
	workspaceSubscriptions,
	workspaceUsageReservations,
	workspaces,
} from '@db/schema';
import type { CloneLogicalDatabaseRequest, DatabaseExternalAccessRequest, MoveLogicalDatabaseRequest, RenameLogicalDatabaseRequest } from '@schemas/logicalDatabase';
import { recordAuditLog } from '@services/auditLogService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { authenticationFailureResponse } from '@services/auth/authenticationFailureService';
import { createBackup } from '@controllers/DatabaseBackupController';
import { databaseBackupService, type DatabaseBackupConnection } from '@services/databases/databaseBackupService';
import { databaseClusterEndpoint } from '@services/databases/databaseClusterEndpointService';
import { sharedDatabaseProvisioner } from '@services/databases/sharedDatabaseProvisionerFactory';
import { decryptCredential, encryptCredential } from '@services/encryption/credentialEncryptionService';
import { commitUsageReservation, effectiveEntitlement, releaseUsageReservation, reserveWorkspaceUsage } from '@services/usage/quotaEngine';
import type { RequestMetadata } from '@utils/request';
import { workspaceDatabaseIdentifier } from '@utils/databaseIdentifier';

interface ClusterCredential { database: string; password: string; username: string }
interface WorkspaceAccess { actorUserId: string; id: string; publicId: number }

async function workspaceAccess(request: Request, publicId: number, metadata: RequestMetadata): Promise<WorkspaceAccess> {
	const actor = await authenticateSession(request, metadata);
	const [workspace] = await db.select({ id: workspaces.id, publicId: workspaces.publicId })
		.from(customers)
		.innerJoin(workspaceMemberships, and(eq(workspaceMemberships.customerId, customers.id), eq(workspaceMemberships.status, 'active'), isNull(workspaceMemberships.deletedAt)))
		.innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), eq(workspaces.publicId, publicId), eq(workspaces.status, 'active'), isNull(workspaces.deletedAt)))
		.innerJoin(workspaceSubscriptions, and(eq(workspaceSubscriptions.workspaceId, workspaces.id), eq(workspaceSubscriptions.isPrimary, true), sql`${workspaceSubscriptions.status} IN ('active', 'trialing')`, isNull(workspaceSubscriptions.deletedAt)))
		.where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt))).limit(1);
	if (!workspace) throw new Error('Workspace not found.');
	return { actorUserId: actor.userId, ...workspace };
}

async function databaseRecord(workspaceId: string, databaseId: string) {
	const [record] = await db.select({ database: logicalDatabases, cluster: databaseClusters, resource: workspaceResources, userCredential: databaseUsers.credentialCiphertext })
		.from(logicalDatabases)
		.innerJoin(databaseClusters, and(eq(databaseClusters.id, logicalDatabases.clusterId), eq(databaseClusters.status, 'active'), isNull(databaseClusters.deletedAt)))
		.innerJoin(workspaceResources, and(eq(workspaceResources.id, logicalDatabases.resourceId), isNull(workspaceResources.deletedAt)))
		.leftJoin(databaseUsers, and(eq(databaseUsers.id, logicalDatabases.databaseUserId), isNull(databaseUsers.deletedAt)))
		.where(and(eq(logicalDatabases.id, databaseId), eq(logicalDatabases.workspaceId, workspaceId), eq(logicalDatabases.status, 'active'), isNull(logicalDatabases.deletedAt))).limit(1);
	return record;
}

function connection(record: NonNullable<Awaited<ReturnType<typeof databaseRecord>>>, databaseName = record.database.databaseName, password?: string, username = record.database.username): DatabaseBackupConnection {
	const current = JSON.parse(decryptCredential(record.userCredential ?? record.database.credentialCiphertext)) as DatabaseBackupConnection;
	const endpoint = databaseClusterEndpoint(record.cluster);
	return { ...current, databaseName, engine: record.cluster.engine, host: endpoint.host, password: password ?? current.password, port: endpoint.port, tlsMode: endpoint.tlsMode, username };
}

function adminConnection(record: NonNullable<Awaited<ReturnType<typeof databaseRecord>>>) {
	const admin = JSON.parse(decryptCredential(record.cluster.adminCredentialCiphertext)) as ClusterCredential;
	const endpoint = databaseClusterEndpoint(record.cluster);
	return { admin, endpoint };
}

async function connectedApplications(databaseId: string): Promise<Array<{ id: string; name: string }>> {
	const rows = await db.select({ id: applicationBuilds.id, metadata: applicationBuilds.metadata }).from(applicationDatabaseBindings)
		.innerJoin(applicationBuilds, and(eq(applicationBuilds.id, applicationDatabaseBindings.applicationBuildId), isNull(applicationBuilds.deletedAt)))
		.where(and(eq(applicationDatabaseBindings.logicalDatabaseId, databaseId), isNull(applicationDatabaseBindings.deletedAt)));
	return rows.map((row) => ({ id: row.id, name: String(row.metadata?.name ?? 'Application') })).sort((left, right) => left.name.localeCompare(right.name));
}

function dependenciesMatch(expected: string[], provided: string[]): boolean {
	const submitted = [...provided].sort();
	return expected.length === submitted.length && expected.every((name, index) => name === submitted[index]);
}

async function restoreSafetyBackup(workspaceId: string, sourceId: string, target: DatabaseBackupConnection) {
	const backup = await createBackup(workspaceId, sourceId, 7, 'manual');
	if (!backup?.id) throw new Error('Safety backup could not be created.');
	const [stored] = await db.select().from(databaseBackups).where(eq(databaseBackups.id, backup.id)).limit(1);
	if (!stored?.storageKey || !stored.checksumSha256) throw new Error('Safety backup artifact is incomplete.');
	await databaseBackupService.restore(target, stored.storageKey, stored.checksumSha256, stored.storageProvider);
	return stored;
}

/** Safety-backed clone, rename, workspace transfer, and customer gateway policy. */
export class DatabaseLifecycleController {
	public static async clone(request: Request, workspacePublicId: number, databaseId: string, input: CloneLogicalDatabaseRequest, metadata: RequestMetadata): Promise<Response> {
		let actorUserId: string | undefined;
		let reservationId: string | undefined;
		let createdPhysicalName: string | undefined;
		let source: Awaited<ReturnType<typeof databaseRecord>> | undefined;
		try {
			const access = await workspaceAccess(request, workspacePublicId, metadata);
			actorUserId = access.actorUserId;
			await recordAuditLog({ actorUserId, action: 'logical_database.clone_requested', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			source = await databaseRecord(access.id, databaseId);
			if (!source) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			if (input.confirmationName !== source.database.databaseName) return resp.failure('Confirmation must exactly match the source database name.', resp.codes.VALIDATION_ERROR, undefined, null, undefined, 400);
			const physicalName = workspaceDatabaseIdentifier(access.publicId, input.name);
			const [duplicate] = await db.select({ id: logicalDatabases.id }).from(logicalDatabases).where(and(eq(logicalDatabases.clusterId, source.cluster.id), eq(logicalDatabases.databaseName, physicalName), isNull(logicalDatabases.deletedAt))).limit(1);
			if (duplicate) return resp.failure('Database name is already in use.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409);
			const [{ value: used }] = await db.select({ value: count() }).from(logicalDatabases).where(and(eq(logicalDatabases.workspaceId, access.id), isNull(logicalDatabases.deletedAt)));
			const reservation = await reserveWorkspaceUsage({ workspaceId: access.id, code: 'databases.count', current: Number(used), idempotencyKey: `database-clone:${randomUUID()}` });
			reservationId = reservation.reservationId;
			if (!reservation.allowed || !reservationId) return resp.failure('Workspace database limit reached.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, { quota: reservation }, undefined, 422);
			const credentials = connection(source, physicalName);
			const { admin, endpoint } = adminConnection(source);
			await sharedDatabaseProvisioner(source.cluster.engine).createLogicalDatabase({ adminDatabase: admin.database, adminPassword: admin.password, adminUsername: admin.username, connectionLimit: source.database.connectionLimit ?? undefined, databaseName: physicalName, engine: source.cluster.engine, existingUser: true, host: endpoint.host, password: credentials.password, port: endpoint.port, tlsMode: endpoint.tlsMode, username: source.database.username, workspaceId: access.id });
			createdPhysicalName = physicalName;
			const backup = await restoreSafetyBackup(access.id, source.database.id, credentials);
			const [created] = await db.transaction(async (transaction) => {
				const [resource] = await transaction.insert(workspaceResources).values({ workspaceId: access.id, provider: source!.resource.provider, kind: 'database', name: input.name, providerResourceId: `logical:${source!.cluster.id}:${physicalName}`, status: 'running', metadata: source!.resource.metadata, lastReconciledAt: new Date() }).returning({ id: workspaceResources.id });
				const [database] = await transaction.insert(logicalDatabases).values({ workspaceId: access.id, resourceId: resource.id, clusterId: source!.cluster.id, databaseUserId: source!.database.databaseUserId, status: 'active', databaseName: physicalName, username: source!.database.username, credentialCiphertext: encryptCredential(JSON.stringify(credentials)), storageQuotaMb: source!.database.storageQuotaMb, connectionLimit: source!.database.connectionLimit, metadata: { ...source!.database.metadata, displayName: input.name, clonedFromDatabaseId: source!.database.id, cloneBackupId: backup.id } }).returning();
				if (!database || !source!.database.databaseUserId) throw new Error('Unable to persist cloned database.');
				await transaction.insert(databaseUserGrants).values({ workspaceId: access.id, logicalDatabaseId: database.id, databaseUserId: source!.database.databaseUserId, accessLevel: 'owner', privileges: ['select', 'insert', 'update', 'delete'], grantedByUserId: access.actorUserId });
				return [database];
			});
			await commitUsageReservation(reservationId, 'logical_database', created.id);
			await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.cloned', resourceType: 'logical_database', resourceId: created.id, metadata: { workspacePublicId, sourceDatabaseId: databaseId, safetyBackupId: backup.id }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Database cloned from a verified safety backup.', { database: created, safetyBackupId: backup.id }, resp.codes.CREATED, undefined, 201);
		} catch (error) {
			if (reservationId) await releaseUsageReservation(reservationId, error instanceof Error ? error.message : 'Database clone failed.').catch(() => undefined);
			if (createdPhysicalName && source) { const { admin, endpoint } = adminConnection(source); await sharedDatabaseProvisioner(source.cluster.engine).deleteLogicalDatabase({ adminDatabase: admin.database, adminPassword: admin.password, adminUsername: admin.username, databaseName: createdPhysicalName, dropUser: false, host: endpoint.host, port: endpoint.port, tlsMode: endpoint.tlsMode, username: source.database.username }).catch(() => undefined); }
			if (actorUserId) await recordAuditLog({ actorUserId, action: 'logical_database.clone_failed', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, reason: error instanceof Error ? error.message : 'Unknown clone failure.' }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }).catch(() => undefined);
			return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Database clone failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
		}
	}

	public static async rename(request: Request, workspacePublicId: number, databaseId: string, input: RenameLogicalDatabaseRequest, metadata: RequestMetadata): Promise<Response> {
		let actorUserId: string | undefined;
		let replacementCreated = false;
		let record: Awaited<ReturnType<typeof databaseRecord>> | undefined;
		try {
			const access = await workspaceAccess(request, workspacePublicId, metadata);
			actorUserId = access.actorUserId;
			await recordAuditLog({ actorUserId, action: 'logical_database.rename_requested', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			record = await databaseRecord(access.id, databaseId);
			if (!record) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const applications = await connectedApplications(databaseId);
			if (input.confirmationName !== record.database.databaseName || !dependenciesMatch(applications.map(({ name }) => name), input.connectedApplicationNames)) return resp.failure('Rename confirmation does not match current dependencies.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, { connectedApplications: applications }, undefined, 422);
			const nextName = workspaceDatabaseIdentifier(access.publicId, input.name);
			if (nextName === record.database.databaseName) return resp.failure('Choose a different database name.', resp.codes.INVALID_INPUT_DATA, undefined, null, undefined, 422);
			const [duplicate] = await db.select({ id: logicalDatabases.id }).from(logicalDatabases).where(and(eq(logicalDatabases.clusterId, record.cluster.id), eq(logicalDatabases.databaseName, nextName), isNull(logicalDatabases.deletedAt))).limit(1);
			if (duplicate) return resp.failure('Database name is already in use.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409);
			const nextConnection = connection(record, nextName);
			const { admin, endpoint } = adminConnection(record);
			await sharedDatabaseProvisioner(record.cluster.engine).createLogicalDatabase({ adminDatabase: admin.database, adminPassword: admin.password, adminUsername: admin.username, connectionLimit: record.database.connectionLimit ?? undefined, databaseName: nextName, engine: record.cluster.engine, existingUser: true, host: endpoint.host, password: nextConnection.password, port: endpoint.port, tlsMode: endpoint.tlsMode, username: record.database.username, workspaceId: access.id });
			replacementCreated = true;
			const backup = await restoreSafetyBackup(access.id, databaseId, nextConnection);
			await db.transaction(async (transaction) => {
				await transaction.update(logicalDatabases).set({ databaseName: nextName, credentialCiphertext: encryptCredential(JSON.stringify(nextConnection)), metadata: { ...record!.database.metadata, displayName: input.name, previousDatabaseName: record!.database.databaseName, renamedWithBackupId: backup.id }, updatedAt: new Date() }).where(eq(logicalDatabases.id, databaseId));
				await transaction.update(workspaceResources).set({ name: input.name, providerResourceId: `logical:${record!.cluster.id}:${nextName}`, updatedAt: new Date() }).where(eq(workspaceResources.id, record!.resource.id));
			});
			replacementCreated = false;
			let cleanupWarning: string | undefined;
			try { await sharedDatabaseProvisioner(record.cluster.engine).deleteLogicalDatabase({ adminDatabase: admin.database, adminPassword: admin.password, adminUsername: admin.username, databaseName: record.database.databaseName, dropUser: false, host: endpoint.host, port: endpoint.port, tlsMode: endpoint.tlsMode, username: record.database.username }); }
			catch (error) { cleanupWarning = `The renamed database is active, but the previous physical database could not be removed automatically: ${error instanceof Error ? error.message : 'Unknown cleanup error.'}`; }
			await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.renamed', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, previousName: record.database.databaseName, databaseName: nextName, safetyBackupId: backup.id, affectedApplications: applications, cleanupWarning }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success(cleanupWarning ?? 'Database renamed. Connected applications must be redeployed to receive the new database name.', { databaseName: nextName, displayName: input.name, affectedApplications: applications, cleanupWarning, safetyBackupId: backup.id }, resp.codes.UPDATED);
		} catch (error) {
			if (replacementCreated && record) { const nextName = workspaceDatabaseIdentifier(workspacePublicId, input.name); const { admin, endpoint } = adminConnection(record); await sharedDatabaseProvisioner(record.cluster.engine).deleteLogicalDatabase({ adminDatabase: admin.database, adminPassword: admin.password, adminUsername: admin.username, databaseName: nextName, dropUser: false, host: endpoint.host, port: endpoint.port, tlsMode: endpoint.tlsMode, username: record.database.username }).catch(() => undefined); }
			if (actorUserId) await recordAuditLog({ actorUserId, action: 'logical_database.rename_failed', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, reason: error instanceof Error ? error.message : 'Unknown rename failure.' }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }).catch(() => undefined);
			return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Database rename failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
		}
	}

	public static async move(request: Request, workspacePublicId: number, databaseId: string, input: MoveLogicalDatabaseRequest, metadata: RequestMetadata): Promise<Response> {
		let actorUserId: string | undefined;
		let reservationId: string | undefined;
		let targetCreated = false;
		let record: Awaited<ReturnType<typeof databaseRecord>> | undefined;
		try {
			const sourceAccess = await workspaceAccess(request, workspacePublicId, metadata);
			actorUserId = sourceAccess.actorUserId;
			await recordAuditLog({ actorUserId, action: 'logical_database.move_requested', resourceType: 'logical_database', resourceId: databaseId, metadata: { sourceWorkspacePublicId: workspacePublicId, targetWorkspacePublicId: input.targetWorkspacePublicId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			const targetAccess = await workspaceAccess(request, input.targetWorkspacePublicId, metadata);
			if (sourceAccess.id === targetAccess.id) return resp.failure('Choose a different workspace.', resp.codes.INVALID_INPUT_DATA, undefined, null, undefined, 422);
			record = await databaseRecord(sourceAccess.id, databaseId);
			if (!record) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			if (input.confirmationName !== record.database.databaseName) return resp.failure('Confirmation must exactly match the database name.', resp.codes.VALIDATION_ERROR, undefined, null, undefined, 400);
			const applications = await connectedApplications(databaseId);
			if (applications.length) return resp.failure('Disconnect every application before moving this database.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, { connectedApplications: applications }, undefined, 422);
			if (!record.database.databaseUserId) throw new Error('Database owner record is missing.');
			const [[{ value: sharedDatabaseCount }], [{ value: activeTransferCount }]] = await Promise.all([
				db.select({ value: count() }).from(logicalDatabases).where(and(eq(logicalDatabases.databaseUserId, record.database.databaseUserId), isNull(logicalDatabases.deletedAt))),
				db.select({ value: count() }).from(databaseTransferJobs).where(and(eq(databaseTransferJobs.logicalDatabaseId, databaseId), inArray(databaseTransferJobs.status, ['queued', 'running', 'cancel_requested']), isNull(databaseTransferJobs.deletedAt))),
			]);
			if (Number(sharedDatabaseCount) > 1) return resp.failure('This database shares its login with other databases. Assign an isolated database user before moving it.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, null, undefined, 422);
			if (Number(activeTransferCount)) return resp.failure('Wait for the active database transfer to finish before moving.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, null, undefined, 422);
			const targetName = workspaceDatabaseIdentifier(targetAccess.publicId, input.name);
			const targetUsername = workspaceDatabaseIdentifier(targetAccess.publicId, input.name);
			const [duplicate] = await db.select({ id: logicalDatabases.id }).from(logicalDatabases).where(and(eq(logicalDatabases.clusterId, record.cluster.id), eq(logicalDatabases.databaseName, targetName), isNull(logicalDatabases.deletedAt))).limit(1);
			if (duplicate) return resp.failure('Database name is already in use in the target workspace.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 409);
			const [{ value: targetUsed }] = await db.select({ value: count() }).from(logicalDatabases).where(and(eq(logicalDatabases.workspaceId, targetAccess.id), isNull(logicalDatabases.deletedAt)));
			const reservation = await reserveWorkspaceUsage({ workspaceId: targetAccess.id, code: 'databases.count', current: Number(targetUsed), idempotencyKey: `database-move:${databaseId}:${targetAccess.id}` });
			reservationId = reservation.reservationId;
			if (!reservation.allowed || !reservationId) return resp.failure('Target workspace database limit reached.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, { quota: reservation }, undefined, 422);
			const password = randomBytes(32).toString('base64url');
			const targetConnection = connection(record, targetName, password, targetUsername);
			const { admin, endpoint } = adminConnection(record);
			await sharedDatabaseProvisioner(record.cluster.engine).createLogicalDatabase({ adminDatabase: admin.database, adminPassword: admin.password, adminUsername: admin.username, connectionLimit: record.database.connectionLimit ?? undefined, databaseName: targetName, engine: record.cluster.engine, host: endpoint.host, password, port: endpoint.port, tlsMode: endpoint.tlsMode, username: targetUsername, workspaceId: targetAccess.id });
			targetCreated = true;
			const backup = await restoreSafetyBackup(sourceAccess.id, databaseId, targetConnection);
			const now = new Date();
			const [newUser] = await db.transaction(async (transaction) => {
				const [user] = await transaction.insert(databaseUsers).values({ workspaceId: targetAccess.id, clusterId: record!.cluster.id, username: targetUsername, credentialCiphertext: encryptCredential(JSON.stringify(targetConnection)) }).returning();
				if (!user) throw new Error('Unable to persist the target database user.');
				await transaction.update(logicalDatabases).set({ workspaceId: targetAccess.id, databaseUserId: user.id, databaseName: targetName, username: targetUsername, credentialCiphertext: encryptCredential(JSON.stringify(targetConnection)), metadata: { ...record!.database.metadata, displayName: input.name, movedFromWorkspacePublicId: workspacePublicId, movedWithBackupId: backup.id }, updatedAt: now }).where(eq(logicalDatabases.id, databaseId));
				await transaction.update(workspaceResources).set({ workspaceId: targetAccess.id, name: input.name, providerResourceId: `logical:${record!.cluster.id}:${targetName}`, updatedAt: now }).where(eq(workspaceResources.id, record!.resource.id));
				await transaction.update(databaseUserGrants).set({ workspaceId: targetAccess.id, databaseUserId: user.id, updatedAt: now }).where(and(eq(databaseUserGrants.logicalDatabaseId, databaseId), isNull(databaseUserGrants.deletedAt)));
				for (const table of [databaseBackups, databaseBackupSchedules, databaseSavedQueries, databaseTransferJobs]) await transaction.update(table).set({ workspaceId: targetAccess.id, updatedAt: now }).where(eq(table.logicalDatabaseId, databaseId));
				await transaction.update(databaseExternalAccessRules).set({ status: 'revoked', deletedAt: now, deleteReason: 'Database moved to another workspace.', updatedAt: now }).where(and(eq(databaseExternalAccessRules.logicalDatabaseId, databaseId), isNull(databaseExternalAccessRules.deletedAt)));
				return [user];
			});
			await commitUsageReservation(reservationId, 'logical_database', databaseId);
			targetCreated = false;
			let cleanupWarning: string | undefined;
			try {
				await sharedDatabaseProvisioner(record.cluster.engine).deleteLogicalDatabase({ adminDatabase: admin.database, adminPassword: admin.password, adminUsername: admin.username, databaseName: record.database.databaseName, dropUser: true, host: endpoint.host, port: endpoint.port, tlsMode: endpoint.tlsMode, username: record.database.username });
				await db.transaction(async (transaction) => {
					await transaction.update(databaseUsers).set({ status: 'suspended', deletedAt: now, deleteReason: 'Database moved to another workspace.', updatedAt: now }).where(eq(databaseUsers.id, record!.database.databaseUserId!));
					await transaction.update(workspaceUsageReservations).set({ status: 'released', releasedAt: now, releaseReason: 'Database moved to another workspace.', updatedAt: now }).where(and(eq(workspaceUsageReservations.workspaceId, sourceAccess.id), eq(workspaceUsageReservations.resourceType, 'logical_database'), eq(workspaceUsageReservations.resourceId, databaseId), eq(workspaceUsageReservations.status, 'committed'), isNull(workspaceUsageReservations.deletedAt)));
				});
			} catch (error) { cleanupWarning = `The database is active in the target workspace, but the previous physical database requires operator cleanup: ${error instanceof Error ? error.message : 'Unknown cleanup error.'}`; }
			await recordAuditLog({ actorUserId: sourceAccess.actorUserId, action: 'logical_database.moved', resourceType: 'logical_database', resourceId: databaseId, metadata: { sourceWorkspacePublicId: workspacePublicId, targetWorkspacePublicId: input.targetWorkspacePublicId, databaseName: targetName, safetyBackupId: backup.id, cleanupWarning }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success(cleanupWarning ?? 'Database moved. Save the new isolated credentials now.', { ...targetConnection, cleanupWarning, safetyBackupId: backup.id, username: newUser.username }, resp.codes.UPDATED);
		} catch (error) {
			if (reservationId) await releaseUsageReservation(reservationId, error instanceof Error ? error.message : 'Database move failed.').catch(() => undefined);
			if (targetCreated && record) { const name = workspaceDatabaseIdentifier(input.targetWorkspacePublicId, input.name); const username = name; const { admin, endpoint } = adminConnection(record); await sharedDatabaseProvisioner(record.cluster.engine).deleteLogicalDatabase({ adminDatabase: admin.database, adminPassword: admin.password, adminUsername: admin.username, databaseName: name, dropUser: true, host: endpoint.host, port: endpoint.port, tlsMode: endpoint.tlsMode, username }).catch(() => undefined); }
			if (actorUserId) await recordAuditLog({ actorUserId, action: 'logical_database.move_failed', resourceType: 'logical_database', resourceId: databaseId, metadata: { sourceWorkspacePublicId: workspacePublicId, targetWorkspacePublicId: input.targetWorkspacePublicId, reason: error instanceof Error ? error.message : 'Unknown move failure.' }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }).catch(() => undefined);
			return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'Database move failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500);
		}
	}

	public static async externalAccess(request: Request, workspacePublicId: number, databaseId: string, input: DatabaseExternalAccessRequest | undefined, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await workspaceAccess(request, workspacePublicId, metadata);
			if (input) await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.external_access_change_requested', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			const record = await databaseRecord(access.id, databaseId);
			if (!record) return resp.failure('Database not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const entitlement = await effectiveEntitlement(access.id, 'databases.external_access');
			const enabled = entitlement.booleanValue === true || entitlement.isUnlimited || entitlement.limit > 0;
			const [existing] = await db.select().from(databaseExternalAccessRules).where(and(eq(databaseExternalAccessRules.logicalDatabaseId, databaseId), isNull(databaseExternalAccessRules.deletedAt), ne(databaseExternalAccessRules.status, 'revoked'))).limit(1);
			if (!input) { await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.external_access_viewed', resourceType: 'logical_database', resourceId: databaseId, metadata: { workspacePublicId, configured: Boolean(existing) }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Database external-access policy retrieved.', { enabledByPackage: enabled, rule: existing ? { ...existing, endpointHost: getEnvironment().DATABASE_EXTERNAL_GATEWAY_HOST ?? null } : null }); }
			if (!enabled) return resp.failure('External database access is not included in this workspace package.', resp.codes.ORDER_CANNOT_BE_PROCESSED, undefined, null, undefined, 422);
			const revision = createHash('sha256').update(JSON.stringify({ allowedCidrs: input.allowedCidrs, databaseId, expiresAt: input.expiresAt?.toISOString() ?? null })).digest('hex').slice(0, 24);
			const [saved] = await db.transaction(async (transaction) => {
				await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended('database-external-access-port', 0))`);
				if (existing) return transaction.update(databaseExternalAccessRules).set({ allowedCidrs: input.allowedCidrs, expiresAt: input.expiresAt, status: 'pending', failureReason: null, revision, updatedAt: new Date() }).where(eq(databaseExternalAccessRules.id, existing.id)).returning();
				const result = await transaction.execute<{ gateway_port: number }>(sql`select candidate as gateway_port from generate_series(20000, 29999) candidate where not exists (select 1 from database_external_access_rules rule where rule.gateway_port = candidate and rule.deleted_at is null and rule.status <> 'revoked') order by candidate limit 1`);
				const port = result.rows[0];
				if (!port) throw new Error('No database gateway ports are available.');
				return transaction.insert(databaseExternalAccessRules).values({ workspaceId: access.id, logicalDatabaseId: databaseId, createdByUserId: access.actorUserId, gatewayPort: Number(port.gateway_port), allowedCidrs: input.allowedCidrs, expiresAt: input.expiresAt, revision }).returning();
			});
			await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.external_access_saved', resourceType: 'database_external_access_rule', resourceId: saved.id, metadata: { workspacePublicId, databaseId, allowedCidrs: input.allowedCidrs, expiresAt: input.expiresAt?.toISOString() ?? null, gatewayPort: saved.gatewayPort }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('External-access policy saved and queued for gateway synchronization.', { ...saved, endpointHost: getEnvironment().DATABASE_EXTERNAL_GATEWAY_HOST ?? null }, existing ? resp.codes.UPDATED : resp.codes.CREATED, undefined, existing ? 200 : 201);
		} catch (error) { return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'External-access policy failed.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}

	public static async revokeExternalAccess(request: Request, workspacePublicId: number, databaseId: string, metadata: RequestMetadata): Promise<Response> {
		try {
			const access = await workspaceAccess(request, workspacePublicId, metadata);
			const [rule] = await db.select().from(databaseExternalAccessRules).where(and(eq(databaseExternalAccessRules.workspaceId, access.id), eq(databaseExternalAccessRules.logicalDatabaseId, databaseId), isNull(databaseExternalAccessRules.deletedAt), ne(databaseExternalAccessRules.status, 'revoked'))).limit(1);
			if (!rule) return resp.failure('External-access policy not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const now = new Date();
			await db.update(databaseExternalAccessRules).set({ status: 'revoked', deletedAt: now, deleteReason: 'Disabled by workspace user.', updatedAt: now }).where(eq(databaseExternalAccessRules.id, rule.id));
			await recordAuditLog({ actorUserId: access.actorUserId, action: 'logical_database.external_access_revoked', resourceType: 'database_external_access_rule', resourceId: rule.id, metadata: { workspacePublicId, databaseId, gatewayPort: rule.gatewayPort }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('External database access disabled.', { id: rule.id }, resp.codes.UPDATED);
		} catch (error) { return authenticationFailureResponse(error) ?? resp.failure(error instanceof Error ? error.message : 'External access could not be disabled.', resp.codes.INTERNAL_SERVICE_ERROR, undefined, null, undefined, 500); }
	}
}
