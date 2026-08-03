import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { applicationDatabaseBindings, applicationDeployments } from '@db/schema';
import { createApplicationSchema } from '@schemas/application';

describe('customer application deployment', () => {
	it('accepts a public source, runtime, port, and workspace database binding', () => {
		const result = createApplicationSchema.parse({ name: 'API', runtimeCode: 'node-22', repository: 'https://github.com/qubitcodes/example', port: 3000, databases: [{ databaseId: '00000000-0000-4000-8000-000000000001', environmentPrefix: 'DATABASE' }] });
		expect(result).toMatchObject({ branch: 'main', buildPack: 'nixpacks', baseDirectory: '/', port: 3000 });
	});
	it('rejects non-HTTPS sources, path traversal, and invalid domains', () => {
		expect(createApplicationSchema.safeParse({ name: 'API', runtimeCode: 'node-22', repository: 'ssh://github.com/private/repo', baseDirectory: '/../secret', port: 3000, domain: 'not a domain' }).success).toBe(false);
	});
	it('defines durable binding and deployment relationships', () => {
		expect(getTableConfig(applicationDatabaseBindings).foreignKeys).toHaveLength(2);
		expect(getTableConfig(applicationDeployments).foreignKeys).toHaveLength(3);
	});
});
