import { afterEach, describe, expect, it, vi } from 'vitest';

import { analyzeApplicationSource } from '@services/applications/sourceDetectionService';

function githubResponse(url: string, files: Record<string, string>): Response {
	if (url.includes('/git/trees/'))
		return Response.json({
			tree: Object.keys(files).map((path) => ({ path, type: 'blob' })),
		});
	if (url.includes('/branches?')) return Response.json([{ name: 'main' }]);
	const marker = '/main/';
	const path = decodeURIComponent(
		url.slice(url.indexOf(marker) + marker.length),
	);
	return path in files
		? new Response(files[path], { status: 200 })
		: new Response('', { status: 404 });
}

describe('application source detection', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('detects a conventional WordPress repository without composer metadata', async () => {
		const files = {
			'wp-includes/version.php': "<?php $wp_version = '6.8';",
			'wp-settings.php': '<?php',
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/wordpress-example',
			'main',
		);

		expect(result.candidates[0]).toMatchObject({
			commands: { start: 'php -S 0.0.0.0:$PORT' },
			framework: 'wordpress',
			projectDirectory: '/',
			stack: 'php',
		});
	});

	it('supplies a deterministic Laravel start command', async () => {
		const files = {
			'composer.json': JSON.stringify({
				require: { 'laravel/framework': '^12.0' },
			}),
			'artisan': '#!/usr/bin/env php',
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/laravel-example',
			'main',
		);

		expect(result.candidates[0]).toMatchObject({
			commands: {
				start: 'php artisan serve --host=0.0.0.0 --port=$PORT',
			},
			framework: 'laravel',
		});
	});

	it('combines Composer and Node tooling for a Laravel frontend build', async () => {
		const files = {
			'composer.json': JSON.stringify({
				require: { 'laravel/framework': '^12.0' },
			}),
			'composer.lock': '{}',
			'package.json': JSON.stringify({
				devDependencies: { vite: '^6.0.0' },
				scripts: { build: 'vite build' },
			}),
			'package-lock.json': JSON.stringify({ lockfileVersion: 3 }),
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/laravel-vite-example',
			'main',
		);
		const laravel = result.candidates.find(
			(candidate) => candidate.framework === 'laravel',
		);

		expect(laravel?.commands).toMatchObject({
			build: 'npm run build',
			install:
				'composer install --no-interaction --prefer-dist --optimize-autoloader && npm install --include=dev',
		});
	});

	it('detects Rails from a nested Gemfile', async () => {
		const files = {
			'app/Gemfile': "source 'https://rubygems.org'\ngem 'rails', '~> 8.0'\n",
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/rails-example',
			'main',
		);

		expect(result.candidates[0]).toMatchObject({
			commands: {
				install: 'bundle install',
				start: 'bundle exec rails server -b 0.0.0.0 -p $PORT',
			},
			framework: 'rails',
			projectDirectory: 'app',
			stack: 'ruby',
		});
	});

	it('derives a Django WSGI command only when gunicorn is installed', async () => {
		const files = {
			'requirements.txt': 'Django==5.2\ngunicorn==23.0.0\n',
			'website/wsgi.py': 'application = get_wsgi_application()',
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/django-example',
			'main',
		);

		expect(result.candidates[0]?.commands?.start).toBe(
			'gunicorn website.wsgi:application --bind 0.0.0.0:$PORT',
		);
		expect(result.candidates[0]?.commands?.install).toBeUndefined();
		expect(result.evidence).toContain(
			'requirements.txt dependency installation is managed by the Python build provider',
		);
	});

	it('derives a FastAPI command from a conventional entry module', async () => {
		const files = {
			'api/main.py': 'app = FastAPI()',
			'api/requirements.txt': 'fastapi==0.116.0\nuvicorn[standard]==0.35.0\n',
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/fastapi-example',
			'main',
		);

		expect(result.candidates[0]?.commands?.start).toBe(
			'uvicorn main:app --host 0.0.0.0 --port $PORT',
		);
	});

	it('infers reproducible Node commands from the nearest lockfile and scripts', async () => {
		const files = {
			'app/package.json': JSON.stringify({
				dependencies: { next: '^16.0.0' },
				scripts: { build: 'next build', start: 'next start' },
			}),
			'app/pnpm-lock.yaml': 'lockfileVersion: 9',
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/next-example',
			'main',
		);

		expect(result.candidates[0]).toMatchObject({
			commands: {
				build: 'pnpm run build',
				install: 'corepack enable && pnpm install --frozen-lockfile',
				start: 'pnpm run start',
			},
			packageManager: 'pnpm',
		});
	});

	it('uses repairable npm install when a package lock cannot be executed during source inspection', async () => {
		const files = {
			'package.json': JSON.stringify({
				dependencies: { react: '^19.2.0' },
				scripts: { build: 'vite build', start: 'vite preview' },
			}),
			'package-lock.json': JSON.stringify({
				lockfileVersion: 3,
				packages: { '': { dependencies: { react: '^19.1.0' } } },
			}),
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/react-example',
			'main',
		);

		expect(result.candidates[0]?.commands?.install).toBe(
			'npm install --include=dev',
		);
	});

	it('creates an empty env file when a Node start script requires one', async () => {
		const files = {
			'package.json': JSON.stringify({
				dependencies: { next: '^16.0.0' },
				scripts: {
					build: 'next build',
					start: 'node --env-file=.env node_modules/next/dist/bin/next start',
				},
			}),
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/next-example',
			'main',
		);

		expect(result.candidates[0]?.commands?.start).toBe(
			'touch .env && npm run start',
		);
	});

	it('scopes environment templates to each monorepo candidate', async () => {
		const files = {
			'package.json': JSON.stringify({
				dependencies: { express: '^5.0.0' },
				scripts: { start: 'node server.js' },
			}),
			'.env.example': 'NODE_MESSAGE=\n',
			'app/composer.json': JSON.stringify({
				require: { 'laravel/framework': '^12.0' },
			}),
			'app/.env.example': 'APP_KEY=\nAPP_NAME=\n',
		};
		vi.stubGlobal(
			'fetch',
			vi.fn((input: string | URL | Request) =>
				Promise.resolve(githubResponse(String(input), files)),
			),
		);

		const result = await analyzeApplicationSource(
			'https://github.com/ghostdeploy/monorepo-example',
			'main',
		);
		const express = result.candidates.find(
			(candidate) => candidate.framework === 'express',
		);
		const laravel = result.candidates.find(
			(candidate) => candidate.framework === 'laravel',
		);

		expect(express?.environmentKeys).toEqual([
			{ isSecret: false, key: 'NODE_MESSAGE', required: false },
		]);
		expect(laravel?.environmentKeys).toContainEqual({
			isSecret: true,
			key: 'APP_KEY',
			required: true,
		});
	});
});
