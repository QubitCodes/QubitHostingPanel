import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { applicationBuilds, databaseClusters, logicalDatabases, runtimeImages } from '@db/schema';

describe('shared platform schema', () => {
	it('defines shared runtimes, builds, clusters, and logical databases', () => {
		const runtimeConfig = getTableConfig(runtimeImages);
		expect(runtimeConfig.name).toBe('runtime_images');
		expect(runtimeConfig.columns.some((column) => column.name === 'default_port' && column.notNull)).toBe(true);
		expect(runtimeConfig.checks.some((constraint) => constraint.name === 'runtime_images_default_port_check')).toBe(true);
		expect(getTableConfig(applicationBuilds).foreignKeys).toHaveLength(3);
		expect(getTableConfig(databaseClusters).name).toBe('database_clusters');
		expect(getTableConfig(logicalDatabases).foreignKeys).toHaveLength(3);
	});
});
