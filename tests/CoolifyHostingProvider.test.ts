import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetEnvironmentForTests } from '@config/env';
import {
	CoolifyHostingProvider,
	coolifyJobStatus,
	isCoolifyEnvironmentConflict,
	normalizeCoolifyCommand,
	normalizeCoolifyDeploymentLogs,
	normalizeCoolifyRepositoryDirectory,
	normalizeCoolifyWildcardDomain,
	reusableCoolifyApplication,
	shouldRedeployCoolifyApplication,
} from '@services/hosting/CoolifyHostingProvider';

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
	process.env.DATABASE_URL = originalDatabaseUrl;
	resetEnvironmentForTests();
	vi.unstubAllGlobals();
});

describe('normalizeCoolifyWildcardDomain', () => {
	it.each([
		['https://apps-staging.ghostdeploy.com', 'apps-staging.ghostdeploy.com'],
		['http://*.apps-staging.ghostdeploy.com/', 'apps-staging.ghostdeploy.com'],
		['*.apps-staging.ghostdeploy.com', 'apps-staging.ghostdeploy.com'],
	])('normalizes %s', (input, expected) => {
		expect(normalizeCoolifyWildcardDomain(input)).toBe(expected);
	});
});

describe('normalizeCoolifyRepositoryDirectory', () => {
	it('uses the absolute-style directory format required by Coolify', () => {
		expect(normalizeCoolifyRepositoryDirectory('fixtures/example')).toBe(
			'/fixtures/example',
		);
		expect(normalizeCoolifyRepositoryDirectory('./apps/web/')).toBe('/apps/web');
		expect(normalizeCoolifyRepositoryDirectory('/')).toBe('/');
		expect(normalizeCoolifyRepositoryDirectory(undefined)).toBeUndefined();
	});
});

describe('normalizeCoolifyCommand', () => {
	it('resolves portable PORT placeholders to the provider-assigned port', () => {
		expect(
			normalizeCoolifyCommand(
				'php artisan serve --host=0.0.0.0 --port=$PORT',
				'8080',
			),
		).toBe('php artisan serve --host=0.0.0.0 --port=8080');
		expect(normalizeCoolifyCommand('server --bind :${PORT}', '3000')).toBe(
			'server --bind :3000',
		);
	});
});

describe('reusableCoolifyApplication', () => {
	it('recovers an exact partial-create match without selecting a similarly named app', () => {
		expect(
			reusableCoolifyApplication(
				[
					{ uuid: 'one', name: 'workspace-app' },
					{ uuid: 'two', name: 'workspace-app-copy' },
				],
				'workspace-app',
			)?.uuid,
		).toBe('one');
	});
});

describe('isCoolifyEnvironmentConflict', () => {
	it('recognizes the duplicate variable response used for POST-to-PATCH fallback', () => {
		expect(
			isCoolifyEnvironmentConflict(
				new Error(
					'Coolify 409: Environment variable already exists. Use PATCH request to update it.',
				),
			),
		).toBe(true);
		expect(
			isCoolifyEnvironmentConflict(new Error('Coolify 500: request failed')),
		).toBe(false);
	});
});

describe('shouldRedeployCoolifyApplication', () => {
	it('restarts terminal failures without duplicating an active deployment', () => {
		expect(shouldRedeployCoolifyApplication('exited:unhealthy')).toBe(true);
		expect(shouldRedeployCoolifyApplication('running:healthy')).toBe(false);
		expect(shouldRedeployCoolifyApplication('building')).toBe(false);
	});
});

describe('Coolify state and log normalization', () => {
	it('never reports compound unhealthy states as successful', () => {
		expect(coolifyJobStatus('running:healthy')).toBe('succeeded');
		expect(coolifyJobStatus('running:unhealthy')).toBe('failed');
		expect(coolifyJobStatus('exited:unhealthy')).toBe('failed');
		expect(coolifyJobStatus('building')).toBe('running');
	});

	it('uses an active deployment instead of a stale exited container state', async () => {
		process.env.DATABASE_URL =
			'postgresql://test:test@localhost:5432/ghost_deploy_test';
		resetEnvironmentForTests();
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request) => {
				const url = String(input);
				if (url.includes('/deployments/applications/'))
					return Response.json([{ status: 'in_progress' }]);
				return Response.json({ status: 'exited:unhealthy' });
			}),
		);
		const provider = new CoolifyHostingProvider({
			apiToken: 'token',
			baseUrl: 'https://coolify.example',
		});
		expect(await provider.getDeployment('app-uuid')).toBe('running');
	});

	it('turns Coolify structured logs into readable lines', () => {
		expect(
			normalizeCoolifyDeploymentLogs(
				JSON.stringify([
					{ output: 'Installing dependencies' },
					{ output: 'Build failed' },
				]),
			),
		).toBe('Installing dependencies\nBuild failed');
		expect(normalizeCoolifyDeploymentLogs('plain output')).toBe('plain output');
	});
});

describe('Coolify API errors', () => {
	it('preserves field validation details for provisioning diagnostics', async () => {
		process.env.DATABASE_URL =
			'postgresql://test:test@localhost:5432/ghost_deploy_test';
		resetEnvironmentForTests();
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				Response.json(
					{
						message: 'Validation failed.',
						errors: { build_command: ['The build command is invalid.'] },
					},
					{ status: 422 },
				),
			),
		);
		const provider = new CoolifyHostingProvider({
			apiToken: 'token',
			baseUrl: 'https://coolify.example',
		});

		await expect(provider.validateConnection()).rejects.toThrow(
			'Coolify 422: Validation failed. (build_command: The build command is invalid.)',
		);
	});
});

describe('Coolify environment variables', () => {
	it('uses the current API build-time and runtime scope fields', async () => {
		process.env.DATABASE_URL =
			'postgresql://test:test@localhost:5432/ghost_deploy_test';
		resetEnvironmentForTests();
		const bodies: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url = String(input);
				if (typeof init?.body === 'string') bodies.push(init.body);
				if (url.endsWith('/applications')) return Response.json([]);
				return Response.json({ uuid: 'app-uuid' });
			}),
		);
		const provider = new CoolifyHostingProvider({
			apiToken: 'token',
			baseUrl: 'https://coolify.example',
			defaultEnvironmentName: 'provider-production',
			defaultProjectUuid: 'project',
			serverUuid: 'server',
		});

		await provider.provisionApplication({
			deploymentEnvironment: 'testing',
			environmentVariables: [
				{ key: 'API_URL', value: 'https://example.com', scope: 'build' },
			],
			name: 'example',
			runtimeImage: { port: 3000, repository: 'example/node', tag: '22' },
			source: { branch: 'main', repository: 'https://github.com/example/app' },
			workspaceId: 'workspace',
		});

		const environmentBody = bodies
			.map((body) => JSON.parse(body) as Record<string, unknown>)
			.find((body) => body.key === 'API_URL');
		expect(environmentBody).toMatchObject({
			key: 'API_URL',
			is_buildtime: true,
			is_literal: true,
			is_runtime: false,
		});
		const portBody = bodies
			.map((body) => JSON.parse(body) as Record<string, unknown>)
			.find((body) => body.key === 'PORT');
		expect(portBody).toMatchObject({
			key: 'PORT',
			value: '3000',
			is_buildtime: true,
			is_runtime: true,
		});
		const applicationBody = bodies
			.map((body) => JSON.parse(body) as Record<string, unknown>)
			.find((body) => body.git_repository);
		expect(applicationBody?.environment_name).toBe('provider-production');
		expect(applicationBody?.base_directory).toBe('/');
	});
});

describe('framework persistent storage', () => {
	it('creates missing volumes before the first deployment', async () => {
		process.env.DATABASE_URL =
			'postgresql://test:test@localhost:5432/ghost_deploy_test';
		resetEnvironmentForTests();
		const requests: Array<{ body?: string; method: string; url: string }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? 'GET';
				requests.push({
					body: typeof init?.body === 'string' ? init.body : undefined,
					method,
					url,
				});
				if (url.endsWith('/applications') && method === 'GET')
					return Response.json([]);
				if (url.endsWith('/applications/public'))
					return Response.json({ uuid: 'app-uuid' });
				if (url.endsWith('/applications/app-uuid/storages') && method === 'GET')
					return Response.json({ persistent_storages: [] });
				return Response.json({});
			}),
		);
		const provider = new CoolifyHostingProvider({
			apiToken: 'token',
			baseUrl: 'https://coolify.example',
			defaultProjectUuid: 'project',
			serverUuid: 'server',
		});

		await provider.provisionApplication({
			name: 'wordpress-example',
			persistentStorages: [
				{ mountPath: '/app/wp-content', name: 'wordpress-example-wp-content' },
			],
			runtimeImage: { port: 80, repository: 'example/php', tag: '8.5' },
			source: {
				branch: 'main',
				repository: 'https://github.com/example/wordpress',
			},
			workspaceId: 'workspace',
		});

		const storage = requests.find(
			(request) =>
				request.url.endsWith('/applications/app-uuid/storages') &&
				request.method === 'POST',
		);
		expect(storage?.body).toContain('wordpress-example-wp-content');
		expect(
			requests.some(
				(request) =>
					request.url.endsWith('/deploy') && request.method === 'POST',
			),
		).toBe(true);
	});
});

describe('Coolify scheduled tasks', () => {
	it('uses documented task and execution endpoints', async () => {
		process.env.DATABASE_URL =
			'postgresql://test:test@localhost:5432/ghost_deploy_test';
		resetEnvironmentForTests();
		const requests: Array<{ body?: string; method: string; url: string }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
				const url = String(input);
				const method = init?.method ?? 'GET';
				requests.push({
					body: typeof init?.body === 'string' ? init.body : undefined,
					method,
					url,
				});
				if (url.endsWith('/executions'))
					return Response.json([
						{
							uuid: 'execution-1',
							status: 'success',
							duration: 2,
							message: 'done',
						},
					]);
				return Response.json({
					uuid: 'task-1',
					name: 'Scheduler',
					command: 'php artisan schedule:run',
					frequency: '* * * * *',
					timeout: 300,
					enabled: true,
				});
			}),
		);
		const provider = new CoolifyHostingProvider({
			apiToken: 'token',
			baseUrl: 'https://coolify.example',
		});
		const input = {
			name: 'Scheduler',
			command: 'php artisan schedule:run',
			frequency: '* * * * *',
			timeout: 300,
			enabled: true,
		};
		expect(
			(await provider.createApplicationScheduledTask('app-1', input)).uuid,
		).toBe('task-1');
		await provider.updateApplicationScheduledTask('app-1', 'task-1', input);
		expect(
			(
				await provider.listApplicationScheduledTaskExecutions('app-1', 'task-1')
			)[0]?.status,
		).toBe('success');
		await provider.deleteApplicationScheduledTask('app-1', 'task-1');
		expect(requests.map(({ method }) => method)).toEqual([
			'POST',
			'PATCH',
			'GET',
			'DELETE',
		]);
		expect(
			requests.every(({ url }) =>
				url.includes('/applications/app-1/scheduled-tasks'),
			),
		).toBe(true);
	});
});
