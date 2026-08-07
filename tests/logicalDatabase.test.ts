import { describe, expect, it } from 'vitest';

import {
	composeLogicalDatabaseResponse,
	logicalDatabasePhysicalName,
} from '@controllers/LogicalDatabaseController';
import {
	createLogicalDatabaseSchema,
	logicalDatabaseNameAvailabilitySchema,
	logicalDatabasePublicIdSchema,
	rotateDatabaseCredentialSchema,
} from '@schemas/logicalDatabase';

describe('logical database validation', () => {
	it('uses the confirmed snake-case name as the physical database name', () => {
		expect(logicalDatabasePhysicalName('sleebas_pkwvw0')).toBe(
			'sleebas_pkwvw0',
		);
	});
	it('applies conservative connection and storage defaults', () => {
		expect(
			createLogicalDatabaseSchema.parse({
				engine: 'postgresql',
				name: 'main_database_a1b2c3',
			}),
		).toMatchObject({ connectionLimit: 10, storageQuotaMb: 1024, userMode: 'new' });
	});

	it('requires a selected workspace user in existing-user mode', () => {
		expect(createLogicalDatabaseSchema.safeParse({ engine: 'postgresql', name: 'shared_database', userMode: 'existing' }).success).toBe(false);
		expect(createLogicalDatabaseSchema.safeParse({ engine: 'postgresql', name: 'shared_database', userMode: 'existing', databaseUserId: '3a993f13-cb14-4b72-b705-6980ec594fff' }).success).toBe(true);
	});

	it('requires explicit acceptance before rotating a shared password', () => {
		expect(rotateDatabaseCredentialSchema.safeParse({ acceptedImpact: true }).success).toBe(true);
		expect(rotateDatabaseCredentialSchema.safeParse({ acceptedImpact: false }).success).toBe(false);
	});

	it('rejects SQL-shaped names and unsupported engines', () => {
		expect(
			createLogicalDatabaseSchema.safeParse({
				engine: 'sqlite',
				name: 'main; DROP DATABASE',
			}).success,
		).toBe(false);
		expect(
			createLogicalDatabaseSchema.safeParse({
				engine: 'postgresql',
				name: 'Main database',
			}).success,
		).toBe(false);
		expect(
			logicalDatabaseNameAvailabilitySchema.safeParse({
				name: 'main_database_a1b2c3',
			}).success,
		).toBe(true);
		expect(
			logicalDatabaseNameAvailabilitySchema.safeParse({ name: 'main-database' })
				.success,
		).toBe(false);
	});

	it('requires a UUID for credential routes', () => {
		expect(
			logicalDatabasePublicIdSchema.safeParse('database-one').success,
		).toBe(false);
	});

	it('composes inserted database fields with cluster engine metadata', () => {
		expect(
			composeLogicalDatabaseResponse(
				{ id: 'database-id', status: 'active' },
				{ engine: 'postgresql', engineVersion: '18.4' },
			),
		).toEqual({
			id: 'database-id',
			status: 'active',
			engine: 'postgresql',
			engineVersion: '18.4',
		});
	});
});
