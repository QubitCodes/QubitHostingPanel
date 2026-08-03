import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { databaseClusters } from '@db/schema';
import type { CreateClusterBackupInput, CreateDatabaseClusterInput, UpdateDatabaseClusterInput } from '@schemas/databaseCluster';
import { recordAuditLog } from '@services/auditLogService';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import { encryptCredential } from '@services/encryption/credentialEncryptionService';
import { CoolifyHostingProvider } from '@services/hosting/CoolifyHostingProvider';
import type { RequestMetadata } from '@utils/request';

const provider = new CoolifyHostingProvider();
const publicFields = { code: databaseClusters.code, name: databaseClusters.name, engine: databaseClusters.engine, engineVersion: databaseClusters.engineVersion, status: databaseClusters.status, providerResourceId: databaseClusters.providerResourceId, internalHost: databaseClusters.internalHost, port: databaseClusters.port, maximumDatabases: databaseClusters.maximumDatabases, limitsMemory: databaseClusters.limitsMemory, limitsCpus: databaseClusters.limitsCpus, backupConfigurationUuid: databaseClusters.backupConfigurationUuid, backupStatus: databaseClusters.backupStatus, lastHealthCheckedAt: databaseClusters.lastHealthCheckedAt, lastHealthError: databaseClusters.lastHealthError, createdAt: databaseClusters.createdAt };

export class DatabaseClusterController {
	public static async index(request: Request, metadata: RequestMetadata): Promise<Response> { try { await authorizeAdmin(request, 'database_clusters.view', metadata); return resp.success('Database clusters retrieved.', await db.select(publicFields).from(databaseClusters).where(isNull(databaseClusters.deletedAt)).orderBy(desc(databaseClusters.createdAt))); } catch { return resp.failure('Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); } }

	public static async create(request: Request, input: CreateDatabaseClusterInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const admin = await authorizeAdmin(request, 'database_clusters.create', metadata);
			const existing = await db.select({ id: databaseClusters.id }).from(databaseClusters).where(and(eq(databaseClusters.code, input.code), isNull(databaseClusters.deletedAt))).limit(1);
			if (existing[0]) return resp.failure('Cluster code already exists.', resp.codes.RESOURCE_ALREADY_EXISTS, undefined, null, undefined, 400);
			const version = input.engine === 'postgresql' ? '18.4' : '8.0.46';
			const username = input.engine === 'postgresql' ? 'qubit_admin' : 'root';
			const password = randomBytes(36).toString('base64url');
			const created = await provider.createSharedDatabase({ engine: input.engine, name: input.name, password, username, databaseName: 'qubit_platform', image: `${input.engine === 'postgresql' ? 'postgres' : 'mysql'}:${version}`, limitsMemory: input.limitsMemory, limitsCpus: input.limitsCpus });
			const environment = getEnvironment();
			const [cluster] = await db.insert(databaseClusters).values({ code: input.code, name: input.name, engine: input.engine, engineVersion: version, status: 'provisioning', providerResourceId: created.uuid, destinationUuid: environment.COOLIFY_DESTINATION_UUID, projectUuid: environment.COOLIFY_DEFAULT_PROJECT_UUID!, environmentName: environment.COOLIFY_DEFAULT_ENVIRONMENT_NAME, internalHost: created.uuid, port: input.engine === 'postgresql' ? 5432 : 3306, adminCredentialCiphertext: encryptCredential(JSON.stringify({ username, password, database: 'qubit_platform' })), maximumDatabases: input.maximumDatabases, limitsMemory: input.limitsMemory, limitsCpus: input.limitsCpus }).returning(publicFields);
			await recordAuditLog({ actorUserId: admin.userId, action: 'database_cluster.created', resourceType: 'database_cluster', metadata: { code: input.code, engine: input.engine, providerResourceId: created.uuid }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent });
			return resp.success('Database cluster creation started.', cluster, resp.codes.CREATED, undefined, 201);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Cluster creation failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}

	public static async show(request: Request, code: string, metadata: RequestMetadata): Promise<Response> { try { await authorizeAdmin(request, 'database_clusters.view', metadata); const [row] = await db.select(publicFields).from(databaseClusters).where(and(eq(databaseClusters.code, code), isNull(databaseClusters.deletedAt))).limit(1); return row ? resp.success('Database cluster retrieved.', row) : resp.failure('Database cluster not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); } catch { return resp.failure('Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); } }

	public static async update(request: Request, code: string, input: UpdateDatabaseClusterInput, metadata: RequestMetadata): Promise<Response> { try { await authorizeAdmin(request, 'database_clusters.update', metadata); const [row] = await db.update(databaseClusters).set({ ...input, updatedAt: new Date() }).where(and(eq(databaseClusters.code, code), isNull(databaseClusters.deletedAt))).returning(publicFields); return row ? resp.success('Database cluster updated.', row, resp.codes.UPDATED) : resp.failure('Database cluster not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); } catch { return resp.failure('Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); } }

	public static async validate(request: Request, code: string, metadata: RequestMetadata): Promise<Response> { try { await authorizeAdmin(request, 'database_clusters.update', metadata); const [cluster] = await db.select().from(databaseClusters).where(and(eq(databaseClusters.code, code), isNull(databaseClusters.deletedAt))).limit(1); if (!cluster) return resp.failure('Database cluster not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const remote = await provider.getSharedDatabase(cluster.providerResourceId); const healthy = remote.status?.toLowerCase().includes('running:healthy') ?? false; const starting = remote.status?.toLowerCase().includes('running:starting') ?? false; await db.update(databaseClusters).set({ status: healthy ? 'active' : starting ? 'provisioning' : 'unavailable', lastHealthCheckedAt: new Date(), lastHealthError: healthy ? null : `Coolify status: ${remote.status ?? 'unknown'}`, updatedAt: new Date() }).where(eq(databaseClusters.id, cluster.id)); return resp.success('Database cluster validated.', { connected: healthy, status: remote.status ?? 'unknown' }); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Validation failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); } }

	public static async backup(request: Request, code: string, input: CreateClusterBackupInput, metadata: RequestMetadata): Promise<Response> { try { await authorizeAdmin(request, 'database_clusters.manage_backups', metadata); const [cluster] = await db.select().from(databaseClusters).where(and(eq(databaseClusters.code, code), isNull(databaseClusters.deletedAt))).limit(1); if (!cluster) return resp.failure('Database cluster not found.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404); const backup = await provider.createDatabaseBackup(cluster.providerResourceId, input); await db.update(databaseClusters).set({ backupConfigurationUuid: backup.uuid, backupStatus: 'enabled', updatedAt: new Date() }).where(eq(databaseClusters.id, cluster.id)); return resp.success('Database backup configured.', { uuid: backup.uuid }, resp.codes.CREATED, undefined, 201); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Backup configuration failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); } }
}
