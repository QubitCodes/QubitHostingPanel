import { describe, expect, it } from 'vitest';

import { composeLogicalDatabaseResponse } from '@controllers/LogicalDatabaseController';
import { createLogicalDatabaseSchema, logicalDatabasePublicIdSchema } from '@schemas/logicalDatabase';

describe('logical database validation', () => {
	it('applies conservative connection and storage defaults', () => {
		expect(createLogicalDatabaseSchema.parse({ engine: 'postgresql', name: 'Main database' })).toMatchObject({ connectionLimit: 10, storageQuotaMb: 1024 });
	});

	it('rejects SQL-shaped names and unsupported engines', () => {
		expect(createLogicalDatabaseSchema.safeParse({ engine: 'sqlite', name: 'main; DROP DATABASE' }).success).toBe(false);
	});

	it('requires a UUID for credential routes', () => {
		expect(logicalDatabasePublicIdSchema.safeParse('database-one').success).toBe(false);
	});

	it('composes inserted database fields with cluster engine metadata', () => {
		expect(composeLogicalDatabaseResponse({ id: 'database-id', status: 'active' }, { engine: 'postgresql', engineVersion: '18.4' })).toEqual({ id: 'database-id', status: 'active', engine: 'postgresql', engineVersion: '18.4' });
	});
});
