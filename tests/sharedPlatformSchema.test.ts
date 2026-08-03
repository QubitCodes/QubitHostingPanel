import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { applicationBuilds, databaseClusters, logicalDatabases, runtimeImages } from '@db/schema';

describe('shared platform schema', () => {
	it('defines shared runtimes, builds, clusters, and logical databases', () => {
		expect(getTableConfig(runtimeImages).name).toBe('runtime_images');
		expect(getTableConfig(applicationBuilds).foreignKeys).toHaveLength(3);
		expect(getTableConfig(databaseClusters).name).toBe('database_clusters');
		expect(getTableConfig(logicalDatabases).foreignKeys).toHaveLength(3);
	});
});
