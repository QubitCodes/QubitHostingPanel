import { relations, sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { workspaceResources } from './provisioning';
import { workspaces } from './tenancy';

export const runtimeLanguageEnum = pgEnum('runtime_language', ['static', 'php', 'node', 'python']);
export const runtimeImageStatusEnum = pgEnum('runtime_image_status', ['active', 'deprecated', 'disabled']);
export const applicationBuildStatusEnum = pgEnum('application_build_status', ['queued', 'building', 'succeeded', 'failed', 'cancelled']);
export const applicationDeploymentStatusEnum = pgEnum('application_deployment_status', ['queued', 'deploying', 'running', 'failed', 'stopped']);
export const databaseEngineEnum = pgEnum('database_engine', ['postgresql', 'mysql']);
export const databaseClusterStatusEnum = pgEnum('database_cluster_status', ['provisioning', 'active', 'maintenance', 'unavailable', 'retired']);
export const databaseTlsModeEnum = pgEnum('database_tls_mode', ['disabled', 'require', 'verify-full']);
export const logicalDatabaseStatusEnum = pgEnum('logical_database_status', ['provisioning', 'active', 'suspended', 'failed']);
export const databaseBackupStatusEnum = pgEnum('database_backup_status', ['queued', 'running', 'completed', 'failed', 'deleted']);
export const databaseRestoreStatusEnum = pgEnum('database_restore_status', ['not_started', 'running', 'completed', 'failed']);

/** Shared, immutable base images reused across customer application containers. */
export const runtimeImages = pgTable('runtime_images', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: varchar('code', { length: 80 }).notNull(),
	language: runtimeLanguageEnum('language').notNull(),
	version: varchar('version', { length: 40 }).notNull(),
	registry: varchar('registry', { length: 255 }).notNull().default('ghcr.io'),
	repository: varchar('repository', { length: 255 }).notNull(),
	tag: varchar('tag', { length: 120 }).notNull(),
	defaultPort: integer('default_port').notNull(),
	digest: varchar('digest', { length: 255 }),
	status: runtimeImageStatusEnum('status').notNull().default('active'),
	isDefault: boolean('is_default').notNull().default(false),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('runtime_images_code_active_unique').on(table.code).where(sql`${table.deletedAt} IS NULL`),
	uniqueIndex('runtime_images_reference_active_unique').on(table.registry, table.repository, table.tag).where(sql`${table.deletedAt} IS NULL`),
	index('runtime_images_language_status_idx').on(table.language, table.status),
	check('runtime_images_default_port_check', sql`${table.defaultPort} BETWEEN 1 AND 65535`),
]);

/** Build artifact history connecting customer source revisions to deployable images. */
export const applicationBuilds = pgTable('application_builds', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	resourceId: uuid('resource_id').references(() => workspaceResources.id, { onDelete: 'restrict' }),
	runtimeImageId: uuid('runtime_image_id').notNull().references(() => runtimeImages.id, { onDelete: 'restrict' }),
	status: applicationBuildStatusEnum('status').notNull().default('queued'),
	sourceRepository: varchar('source_repository', { length: 500 }).notNull(),
	sourceRef: varchar('source_ref', { length: 255 }).notNull().default('main'),
	commitSha: varchar('commit_sha', { length: 64 }),
	installCommand: varchar('install_command', { length: 500 }),
	buildCommand: varchar('build_command', { length: 500 }),
	startCommand: varchar('start_command', { length: 500 }),
	baseDirectory: varchar('base_directory', { length: 500 }).notNull().default('/'),
	publishDirectory: varchar('publish_directory', { length: 500 }),
	applicationPort: integer('application_port').notNull(),
	requestedDomain: varchar('requested_domain', { length: 255 }),
	imageRepository: varchar('image_repository', { length: 500 }),
	imageTag: varchar('image_tag', { length: 255 }),
	imageDigest: varchar('image_digest', { length: 255 }),
	providerBuildId: varchar('provider_build_id', { length: 255 }),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true }),
	failureReason: text('failure_reason'),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	index('application_builds_workspace_status_idx').on(table.workspaceId, table.status, table.createdAt),
	index('application_builds_resource_created_idx').on(table.resourceId, table.createdAt),
	check('application_builds_completion_check', sql`${table.completedAt} IS NULL OR ${table.startedAt} IS NOT NULL`),
	check('application_builds_port_check', sql`${table.applicationPort} BETWEEN 1 AND 65535`),
]);

/** One selected logical database exposed to an application through server-managed environment variables. */
export const applicationDatabaseBindings = pgTable('application_database_bindings', {
	id: uuid('id').primaryKey().defaultRandom(),
	applicationBuildId: uuid('application_build_id').notNull().references(() => applicationBuilds.id, { onDelete: 'cascade' }),
	logicalDatabaseId: uuid('logical_database_id').notNull().references(() => logicalDatabases.id, { onDelete: 'restrict' }),
	environmentPrefix: varchar('environment_prefix', { length: 40 }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('application_database_bindings_active_unique').on(table.applicationBuildId, table.logicalDatabaseId).where(sql`${table.deletedAt} IS NULL`),
	uniqueIndex('application_database_bindings_prefix_active_unique').on(table.applicationBuildId, table.environmentPrefix).where(sql`${table.deletedAt} IS NULL`),
]);

/** Provider deployment history for customer applications and retries. */
export const applicationDeployments = pgTable('application_deployments', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	applicationBuildId: uuid('application_build_id').notNull().references(() => applicationBuilds.id, { onDelete: 'restrict' }),
	resourceId: uuid('resource_id').references(() => workspaceResources.id, { onDelete: 'restrict' }),
	status: applicationDeploymentStatusEnum('status').notNull().default('queued'),
	providerDeploymentId: varchar('provider_deployment_id', { length: 255 }),
	publicUrl: varchar('public_url', { length: 500 }),
	failureReason: text('failure_reason'),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true }),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [index('application_deployments_workspace_status_idx').on(table.workspaceId, table.status, table.createdAt), index('application_deployments_build_created_idx').on(table.applicationBuildId, table.createdAt)]);

/** One shared database engine instance capable of hosting many isolated logical databases. */
export const databaseClusters = pgTable('database_clusters', {
	id: uuid('id').primaryKey().defaultRandom(),
	code: varchar('code', { length: 80 }).notNull(),
	name: varchar('name', { length: 160 }).notNull(),
	engine: databaseEngineEnum('engine').notNull(),
	engineVersion: varchar('engine_version', { length: 40 }).notNull(),
	status: databaseClusterStatusEnum('status').notNull().default('provisioning'),
	providerResourceId: varchar('provider_resource_id', { length: 255 }).notNull(),
	destinationUuid: varchar('destination_uuid', { length: 255 }),
	projectUuid: varchar('project_uuid', { length: 255 }).notNull(),
	environmentName: varchar('environment_name', { length: 120 }).notNull(),
	internalHost: varchar('internal_host', { length: 255 }).notNull(),
	port: integer('port').notNull(),
	managementHost: varchar('management_host', { length: 255 }),
	managementPort: integer('management_port'),
	managementTlsMode: databaseTlsModeEnum('management_tls_mode').notNull().default('disabled'),
	adminCredentialCiphertext: text('admin_credential_ciphertext').notNull(),
	maximumDatabases: integer('maximum_databases'),
	limitsMemory: varchar('limits_memory', { length: 40 }),
	limitsCpus: varchar('limits_cpus', { length: 40 }),
	backupConfigurationUuid: varchar('backup_configuration_uuid', { length: 255 }),
	backupStatus: varchar('backup_status', { length: 40 }),
	lastHealthCheckedAt: timestamp('last_health_checked_at', { withTimezone: true }),
	lastHealthError: text('last_health_error'),
	credentialsRotatedAt: timestamp('credentials_rotated_at', { withTimezone: true }),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('database_clusters_name_active_unique').on(table.name).where(sql`${table.deletedAt} IS NULL`),
	uniqueIndex('database_clusters_code_active_unique').on(table.code).where(sql`${table.deletedAt} IS NULL`),
	uniqueIndex('database_clusters_provider_resource_active_unique').on(table.providerResourceId).where(sql`${table.deletedAt} IS NULL`),
	index('database_clusters_engine_status_idx').on(table.engine, table.status),
	check('database_clusters_port_check', sql`${table.port} BETWEEN 1 AND 65535`),
	check('database_clusters_management_port_check', sql`${table.managementPort} IS NULL OR ${table.managementPort} BETWEEN 1 AND 65535`),
	check('database_clusters_management_endpoint_check', sql`(${table.managementHost} IS NULL AND ${table.managementPort} IS NULL) OR (${table.managementHost} IS NOT NULL AND ${table.managementPort} IS NOT NULL)`),
	check('database_clusters_capacity_check', sql`${table.maximumDatabases} IS NULL OR ${table.maximumDatabases} > 0`),
]);

/** Workspace-owned database and restricted login created inside a shared database cluster. */
export const logicalDatabases = pgTable('logical_databases', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	resourceId: uuid('resource_id').references(() => workspaceResources.id, { onDelete: 'restrict' }),
	clusterId: uuid('cluster_id').notNull().references(() => databaseClusters.id, { onDelete: 'restrict' }),
	status: logicalDatabaseStatusEnum('status').notNull().default('provisioning'),
	databaseName: varchar('database_name', { length: 120 }).notNull(),
	username: varchar('username', { length: 120 }).notNull(),
	credentialCiphertext: text('credential_ciphertext').notNull(),
	storageQuotaMb: integer('storage_quota_mb'),
	connectionLimit: integer('connection_limit'),
	lastBackedUpAt: timestamp('last_backed_up_at', { withTimezone: true }),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	uniqueIndex('logical_databases_cluster_name_active_unique').on(table.clusterId, table.databaseName).where(sql`${table.deletedAt} IS NULL`),
	uniqueIndex('logical_databases_cluster_username_active_unique').on(table.clusterId, table.username).where(sql`${table.deletedAt} IS NULL`),
	uniqueIndex('logical_databases_resource_active_unique').on(table.resourceId).where(sql`${table.resourceId} IS NOT NULL AND ${table.deletedAt} IS NULL`),
	index('logical_databases_workspace_status_idx').on(table.workspaceId, table.status),
	check('logical_databases_storage_quota_check', sql`${table.storageQuotaMb} IS NULL OR ${table.storageQuotaMb} > 0`),
	check('logical_databases_connection_limit_check', sql`${table.connectionLimit} IS NULL OR ${table.connectionLimit} > 0`),
]);

/** Encrypted, workspace-owned dump of one logical database and its restore evidence. */
export const databaseBackups = pgTable('database_backups', {
	id: uuid('id').primaryKey().defaultRandom(),
	workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
	logicalDatabaseId: uuid('logical_database_id').notNull().references(() => logicalDatabases.id, { onDelete: 'restrict' }),
	status: databaseBackupStatusEnum('status').notNull().default('queued'),
	restoreStatus: databaseRestoreStatusEnum('restore_status').notNull().default('not_started'),
	storageKey: varchar('storage_key', { length: 500 }),
	checksumSha256: varchar('checksum_sha256', { length: 64 }),
	sizeBytes: bigint('size_bytes', { mode: 'number' }),
	failureReason: text('failure_reason'),
	restoreFailureReason: text('restore_failure_reason'),
	startedAt: timestamp('started_at', { withTimezone: true }),
	completedAt: timestamp('completed_at', { withTimezone: true }),
	lastRestoreStartedAt: timestamp('last_restore_started_at', { withTimezone: true }),
	lastRestoredAt: timestamp('last_restored_at', { withTimezone: true }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
	deletedAt: timestamp('deleted_at', { withTimezone: true }),
	deleteReason: varchar('delete_reason', { length: 500 }),
}, (table) => [
	index('database_backups_workspace_database_created_idx').on(table.workspaceId, table.logicalDatabaseId, table.createdAt),
	index('database_backups_status_expires_idx').on(table.status, table.expiresAt),
	check('database_backups_size_check', sql`${table.sizeBytes} IS NULL OR ${table.sizeBytes} >= 0`),
	check('database_backups_completion_check', sql`${table.completedAt} IS NULL OR ${table.startedAt} IS NOT NULL`),
]);

export const runtimeImageRelations = relations(runtimeImages, ({ many }) => ({ builds: many(applicationBuilds) }));
export const applicationBuildRelations = relations(applicationBuilds, ({ one, many }) => ({ workspace: one(workspaces, { fields: [applicationBuilds.workspaceId], references: [workspaces.id] }), resource: one(workspaceResources, { fields: [applicationBuilds.resourceId], references: [workspaceResources.id] }), runtimeImage: one(runtimeImages, { fields: [applicationBuilds.runtimeImageId], references: [runtimeImages.id] }), databaseBindings: many(applicationDatabaseBindings), deployments: many(applicationDeployments) }));
export const applicationDatabaseBindingRelations = relations(applicationDatabaseBindings, ({ one }) => ({ applicationBuild: one(applicationBuilds, { fields: [applicationDatabaseBindings.applicationBuildId], references: [applicationBuilds.id] }), logicalDatabase: one(logicalDatabases, { fields: [applicationDatabaseBindings.logicalDatabaseId], references: [logicalDatabases.id] }) }));
export const applicationDeploymentRelations = relations(applicationDeployments, ({ one }) => ({ workspace: one(workspaces, { fields: [applicationDeployments.workspaceId], references: [workspaces.id] }), applicationBuild: one(applicationBuilds, { fields: [applicationDeployments.applicationBuildId], references: [applicationBuilds.id] }), resource: one(workspaceResources, { fields: [applicationDeployments.resourceId], references: [workspaceResources.id] }) }));
export const databaseClusterRelations = relations(databaseClusters, ({ many }) => ({ databases: many(logicalDatabases) }));
export const logicalDatabaseRelations = relations(logicalDatabases, ({ one, many }) => ({ workspace: one(workspaces, { fields: [logicalDatabases.workspaceId], references: [workspaces.id] }), resource: one(workspaceResources, { fields: [logicalDatabases.resourceId], references: [workspaceResources.id] }), cluster: one(databaseClusters, { fields: [logicalDatabases.clusterId], references: [databaseClusters.id] }), backups: many(databaseBackups) }));
export const databaseBackupRelations = relations(databaseBackups, ({ one }) => ({ workspace: one(workspaces, { fields: [databaseBackups.workspaceId], references: [workspaces.id] }), logicalDatabase: one(logicalDatabases, { fields: [databaseBackups.logicalDatabaseId], references: [logicalDatabases.id] }) }));

export type RuntimeImage = typeof runtimeImages.$inferSelect;
export type ApplicationBuild = typeof applicationBuilds.$inferSelect;
export type ApplicationDeployment = typeof applicationDeployments.$inferSelect;
export type DatabaseCluster = typeof databaseClusters.$inferSelect;
export type LogicalDatabase = typeof logicalDatabases.$inferSelect;
export type DatabaseBackup = typeof databaseBackups.$inferSelect;
