import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { applicationBuilds, applicationDatabaseBindings, applicationDeployments, databaseBackups, databaseBackupSchedules, databaseClusters, databaseUsers, logicalDatabases, runtimeImages } from '@db/schema';

describe('shared platform schema', () => {
	it('defines shared runtimes, builds, clusters, and logical databases', () => {
		const runtimeConfig = getTableConfig(runtimeImages);
		expect(runtimeConfig.name).toBe('runtime_images');
		expect(runtimeConfig.columns.some((column) => column.name === 'default_port' && column.notNull)).toBe(true);
		expect(runtimeConfig.checks.some((constraint) => constraint.name === 'runtime_images_default_port_check')).toBe(true);
		expect(getTableConfig(applicationBuilds).foreignKeys).toHaveLength(3);
		expect(getTableConfig(applicationBuilds).checks.some((constraint) => constraint.name === 'application_builds_port_check')).toBe(true);
		expect(getTableConfig(applicationDatabaseBindings).foreignKeys).toHaveLength(2);
		expect(getTableConfig(applicationDeployments).foreignKeys).toHaveLength(3);
		const clusterConfig = getTableConfig(databaseClusters);
		expect(clusterConfig.name).toBe('database_clusters');
		expect(clusterConfig.columns.some((column) => column.name === 'management_host')).toBe(true);
		expect(clusterConfig.checks.some((constraint) => constraint.name === 'database_clusters_management_endpoint_check')).toBe(true);
		const databaseUserConfig = getTableConfig(databaseUsers);
		expect(databaseUserConfig.foreignKeys).toHaveLength(2);
		expect(databaseUserConfig.indexes.some((index) => index.config.name === 'database_users_cluster_username_active_unique')).toBe(true);
		expect(getTableConfig(logicalDatabases).foreignKeys).toHaveLength(4);
		const backupConfig = getTableConfig(databaseBackups);
		expect(backupConfig.foreignKeys).toHaveLength(2);
		expect(backupConfig.checks.some((constraint) => constraint.name === 'database_backups_completion_check')).toBe(true);
		const scheduleConfig = getTableConfig(databaseBackupSchedules);
		expect(scheduleConfig.foreignKeys).toHaveLength(2);
		expect(scheduleConfig.indexes.some((index) => index.config.name === 'database_backup_schedules_database_active_unique')).toBe(true);
		expect(scheduleConfig.checks.some((constraint) => constraint.name === 'database_backup_schedules_retention_check')).toBe(true);
	});
});
