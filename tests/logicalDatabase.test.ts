import { describe, expect, it } from 'vitest';

import {
	composeLogicalDatabaseResponse,
	logicalDatabaseContextFailureResponse,
	logicalDatabasePhysicalName,
} from '@controllers/LogicalDatabaseController';
import {
	createLogicalDatabaseSchema,
	logicalDatabaseNameAvailabilitySchema,
	logicalDatabasePublicIdSchema,
	rotateDatabaseCredentialSchema,
} from '@schemas/logicalDatabase';
import { DATABASE_IDENTIFIER_SUFFIX_MAX_LENGTH, workspaceDatabaseIdentifierPrefix } from '@utils/databaseIdentifier';

describe('logical database validation', () => {
	it('prefixes the confirmed suffix with the stable workspace identifier', () => {
		expect(logicalDatabasePhysicalName(100001, 'sleebas')).toBe(
			'w100001_sleebas',
		);
	});
	it('keeps workspace prefixes immutable and reserves identifier length for them', () => {
		expect(workspaceDatabaseIdentifierPrefix(100001)).toBe('w100001_');
		expect(createLogicalDatabaseSchema.safeParse({ engine: 'postgresql', name: 'a'.repeat(DATABASE_IDENTIFIER_SUFFIX_MAX_LENGTH) }).success).toBe(true);
		expect(createLogicalDatabaseSchema.safeParse({ engine: 'postgresql', name: 'a'.repeat(DATABASE_IDENTIFIER_SUFFIX_MAX_LENGTH + 1) }).success).toBe(false);
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

	it('accepts a strong chosen password only for a new database user', () => {
		expect(createLogicalDatabaseSchema.safeParse({ engine: 'postgresql', name: 'main_database', password: 'GeneratedDatabasePassword123' }).success).toBe(true);
		expect(createLogicalDatabaseSchema.safeParse({ engine: 'postgresql', name: 'main_database', password: 'too-short' }).success).toBe(false);
		expect(createLogicalDatabaseSchema.safeParse({ engine: 'postgresql', name: 'main_database', userMode: 'existing', databaseUserId: '3a993f13-cb14-4b72-b705-6980ec594fff', password: 'GeneratedDatabasePassword123' }).success).toBe(false);
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

	it('does not disguise an infrastructure failure as a missing database', async () => {
		const response = logicalDatabaseContextFailureResponse(
			new Error('column does not exist'),
		);
		const body = (await response.json()) as { code: number; message: string };

		expect(response.status).toBe(500);
		expect(body).toMatchObject({
			code: 304,
			message: 'Unable to load database context.',
		});
	});

	it('keeps database-context authentication failures refreshable', async () => {
		const response = logicalDatabaseContextFailureResponse(
			new Error('Session is invalid.'),
		);

		expect(response.status).toBe(401);
	});
});
