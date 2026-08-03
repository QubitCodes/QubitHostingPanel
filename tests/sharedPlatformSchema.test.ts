import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { applicationBuilds, databaseBackups, databaseClusters, logicalDatabases, runtimeImages } from '@db/schema';

describe('shared platform schema', () => {
	it('defines shared runtimes, builds, clusters, and logical databases', () => {
		const runtimeConfig = getTableConfig(runtimeImages);
		expect(runtimeConfig.name).toBe('runtime_images');
		expect(runtimeConfig.columns.some((column) => column.name === 'default_port' && column.notNull)).toBe(true);
		expect(runtimeConfig.checks.some((constraint) => constraint.name === 'runtime_images_default_port_check')).toBe(true);
		expect(getTableConfig(applicationBuilds).foreignKeys).toHaveLength(3);
		const clusterConfig = getTableConfig(databaseClusters);
		expect(clusterConfig.name).toBe('database_clusters');
		expect(clusterConfig.columns.some((column) => column.name === 'management_host')).toBe(true);
		expect(clusterConfig.checks.some((constraint) => constraint.name === 'database_clusters_management_endpoint_check')).toBe(true);
		expect(getTableConfig(logicalDatabases).foreignKeys).toHaveLength(3);
		const backupConfig = getTableConfig(databaseBackups);
		expect(backupConfig.foreignKeys).toHaveLength(2);
		expect(backupConfig.checks.some((constraint) => constraint.name === 'database_backups_completion_check')).toBe(true);
	});
});
