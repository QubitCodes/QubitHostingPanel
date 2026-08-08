import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
	createDatabaseAccessSchema,
	databaseUserActionSchema,
	revokeDatabaseGrantSchema,
	updateDatabaseGrantSchema,
} from '@schemas/databaseAccess';
import { databaseGrantPrivileges } from '@services/databases/databaseAccessService';

describe('database user access contracts', () => {
	it('validates new and existing user modes without accepting mixed credentials', () => {
		expect(createDatabaseAccessSchema.safeParse({ userMode: 'new', username: 'reporting', accessLevel: 'read_only', privileges: [], scopes: [] }).success).toBe(true);
		expect(createDatabaseAccessSchema.safeParse({ userMode: 'existing', databaseUserId: '0d8cffd8-df50-4c83-89d7-134839b17fa3', accessLevel: 'read_write', privileges: [], scopes: [] }).success).toBe(true);
		expect(createDatabaseAccessSchema.safeParse({ userMode: 'existing', databaseUserId: '0d8cffd8-df50-4c83-89d7-134839b17fa3', password: 'Secret-password-123!', accessLevel: 'read_write', privileges: [], scopes: [] }).success).toBe(false);
	});

	it('requires custom privileges and rejects custom data on preset access levels', () => {
		expect(createDatabaseAccessSchema.safeParse({ userMode: 'new', username: 'analyst', accessLevel: 'custom', privileges: ['select'], scopes: [{ schema: 'public', table: 'reports' }] }).success).toBe(true);
		expect(createDatabaseAccessSchema.safeParse({ userMode: 'new', username: 'analyst', accessLevel: 'custom', privileges: [], scopes: [] }).success).toBe(false);
		expect(updateDatabaseGrantSchema.safeParse({ accessLevel: 'read_only', privileges: ['select'], scopes: [] }).success).toBe(false);
		expect(updateDatabaseGrantSchema.safeParse({ accessLevel: 'custom', privileges: ['select'], scopes: [{ schema: 'pg_catalog' }] }).success).toBe(false);
	});

	it('maps preset access levels to explicit engine privileges', () => {
		expect(databaseGrantPrivileges({ accessLevel: 'read_only', privileges: [], scopes: [] })).toEqual(['select']);
		expect(databaseGrantPrivileges({ accessLevel: 'read_write', privileges: [], scopes: [] })).toEqual(['select', 'insert', 'update', 'delete']);
		expect(databaseGrantPrivileges({ accessLevel: 'custom', privileges: ['select', 'update'], scopes: [{ schema: 'public' }] })).toEqual(['select', 'update']);
	});

	it('requires exact-confirmation payload shapes for revocation and user actions', () => {
		expect(revokeDatabaseGrantSchema.safeParse({ confirmation: 'w100001_reader', reason: 'Access no longer required.' }).success).toBe(true);
		expect(databaseUserActionSchema.safeParse({ action: 'suspend', acceptedImpact: true, confirmation: 'w100001_reader', reason: 'Security review.' }).success).toBe(true);
		expect(databaseUserActionSchema.safeParse({ action: 'delete', acceptedImpact: false, confirmation: 'w100001_reader' }).success).toBe(false);
	});

	it('creates owner grants for existing logical databases in the generated migration', () => {
		const migration = readFileSync('src/db/migrations/0047_dizzy_clint_barton.sql', 'utf8');
		expect(migration).toContain('INSERT INTO "database_user_grants"');
		expect(migration).toContain("'owner', 'active'");
		expect(migration).toContain('"revoked_at" IS NULL');
	});
});
