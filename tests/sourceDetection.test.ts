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
			framework: 'wordpress',
			projectDirectory: '/',
			stack: 'php',
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
				start: 'bundle exec rails server -b 0.0.0.0 -p 3000',
			},
			framework: 'rails',
			projectDirectory: 'app',
			stack: 'ruby',
		});
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
});
