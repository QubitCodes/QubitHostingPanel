import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';

import {
	applicationDatabaseBindings,
	applicationDeployments,
} from '@db/schema';
import {
	applicationActionSchema,
	createApplicationSchema,
	deleteApplicationSchema,
	updateApplicationSchema,
} from '@schemas/application';
import { coolifyWebhookSchema } from '@schemas/coolifyWebhook';

describe('customer application deployment', () => {
	it('accepts a public source, runtime, port, and workspace database binding', () => {
		const result = createApplicationSchema.parse({
			name: 'API',
			runtimeCode: 'node-22',
			repository: 'https://github.com/qubitcodes/example',
			port: 3000,
			databases: [
				{
					databaseId: '00000000-0000-4000-8000-000000000001',
					environmentPrefix: 'DATABASE',
				},
			],
		});
		expect(result).toMatchObject({
			branch: 'main',
			buildPack: 'nixpacks',
			baseDirectory: '/',
			port: 3000,
		});
	});
	it('rejects non-HTTPS sources, path traversal, and invalid domains', () => {
		expect(
			createApplicationSchema.safeParse({
				name: 'API',
				runtimeCode: 'node-22',
				repository: 'ssh://github.com/private/repo',
				baseDirectory: '/../secret',
				port: 3000,
				domain: 'not a domain',
			}).success,
		).toBe(false);
	});
	it('defines durable binding and deployment relationships', () => {
		expect(
			getTableConfig(applicationDatabaseBindings).foreignKeys,
		).toHaveLength(2);
		expect(getTableConfig(applicationDeployments).foreignKeys).toHaveLength(3);
	});
	it('validates lifecycle, auto-deploy, visibility, and destructive confirmations', () => {
		expect(applicationActionSchema.parse({ action: 'deactivate' }).action).toBe(
			'deactivate',
		);
		expect(
			updateApplicationSchema.parse({
				branch: 'main',
				baseDirectory: '/',
				port: 3000,
				autoDeployEnabled: false,
				visibility: 'private',
			}).visibility,
		).toBe('private');
		expect(
			deleteApplicationSchema.safeParse({
				acceptedImpact: false,
				confirmationName: 'API',
				databases: [],
			}).success,
		).toBe(false);
		expect(
			deleteApplicationSchema.parse({
				acceptedImpact: true,
				confirmationName: 'API',
				databases: [
					{
						id: '00000000-0000-4000-8000-000000000001',
						confirmationName: 'api_db',
					},
				],
			}).databases,
		).toHaveLength(1);
	});
	it('accepts supported Coolify deployment notifications and rejects unrelated events', () => {
		expect(
			coolifyWebhookSchema.parse({
				application_uuid: 'app-1',
				deployment_uuid: 'deploy-1',
				event: 'deployment_success',
				message: 'Deployed',
				success: true,
			}).event,
		).toBe('deployment_success');
		expect(
			coolifyWebhookSchema.parse({
				event: 'test',
				message: 'Test notification',
				success: true,
			}).event,
		).toBe('test');
		expect(
			coolifyWebhookSchema.safeParse({
				application_uuid: 'app-1',
				event: 'backup_success',
				message: 'Backed up',
				success: true,
			}).success,
		).toBe(false);
	});
});
