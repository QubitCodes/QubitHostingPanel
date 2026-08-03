import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetEnvironmentForTests } from '@config/env';
import { createClusterBackupSchema, createDatabaseClusterSchema } from '@schemas/databaseCluster';
import { decryptCredential, encryptCredential } from '@services/encryption/credentialEncryptionService';

describe('database cluster validation', () => {
	it('accepts supported cluster inputs and applies operational defaults', () => {
		const value = createDatabaseClusterSchema.parse({ code: 'postgres-primary', engine: 'postgresql', name: 'PostgreSQL primary' });
		expect(value).toMatchObject({ maximumDatabases: 250, limitsMemory: '1g', limitsCpus: '1' });
	});

	it('rejects unsafe human-readable codes', () => {
		expect(createDatabaseClusterSchema.safeParse({ code: 'Postgres Primary', engine: 'postgresql', name: 'PostgreSQL primary' }).success).toBe(false);
	});

	it('accepts cron backup expressions', () => {
		expect(createClusterBackupSchema.parse({ frequency: '0 2 * * *' }).frequency).toBe('0 2 * * *');
	});
});

describe('credential encryption', () => {
	beforeEach(() => {
		process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
		process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-only-key-with-enough-entropy';
		resetEnvironmentForTests();
	});

	afterEach(() => { resetEnvironmentForTests(); });

	it('round-trips a credential through a versioned authenticated envelope', () => {
		const plaintext = JSON.stringify({ username: 'qubit_admin', password: 'secret' });
		const encrypted = encryptCredential(plaintext);
		expect(encrypted).not.toContain('secret');
		expect(encrypted.startsWith('v1:')).toBe(true);
		expect(decryptCredential(encrypted)).toBe(plaintext);
	});

	it('rejects a modified authentication tag', () => {
		const parts = encryptCredential('credential').split(':');
		parts[2] = Buffer.alloc(16).toString('base64');
		expect(() => decryptCredential(parts.join(':'))).toThrow();
	});
});
