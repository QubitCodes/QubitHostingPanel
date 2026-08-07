import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	FRAMEWORK_ACCEPTANCE_CASES,
	type FrameworkAcceptanceCase,
} from '@config/frameworkAcceptanceCatalog';

interface RunningFixture {
	child: ChildProcessWithoutNullStreams;
	code: string;
	logs: string[];
}

const FIXTURE_ROOT = resolve(process.cwd(), 'fixtures/frameworks');
const BASE_PORT = Number.parseInt(
	process.env.FRAMEWORK_ACCEPTANCE_PORT_BASE ?? '32100',
	10,
);

/** Returns one configured fixture or fails before starting any process. */
function acceptanceCase(code: string): FrameworkAcceptanceCase {
	const entry = FRAMEWORK_ACCEPTANCE_CASES.find((item) => item.code === code);
	if (!entry) throw new Error(`Acceptance case ${code} is unavailable.`);
	return entry;
}

/** Starts one direct runtime process and retains bounded diagnostic output. */
function startFixture(
	code: string,
	command: string,
	args: string[],
	cwd: string,
	environment: NodeJS.ProcessEnv = process.env,
): RunningFixture {
	const child = spawn(command, args, {
		cwd,
		env: environment,
		stdio: 'pipe',
		windowsHide: true,
	});
	const running: RunningFixture = { child, code, logs: [] };
	for (const stream of [child.stdout, child.stderr])
		stream.on('data', (value: Buffer) => {
			running.logs.push(value.toString());
			if (running.logs.length > 80) running.logs.shift();
		});
	return running;
}

/** Waits for the exact health body while surfacing early process exits. */
async function waitForHealth(
	running: RunningFixture,
	entry: FrameworkAcceptanceCase,
	port: number,
): Promise<void> {
	const deadline = Date.now() + 40_000;
	const url = `http://127.0.0.1:${port}${entry.healthPath}`;
	while (Date.now() < deadline) {
		if (running.child.exitCode !== null)
			throw new Error(
				`${entry.code} exited with ${running.child.exitCode}.\n${running.logs.join('').slice(-4_000)}`,
			);
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
			const body = await response.text();
			if (response.ok && body.includes(entry.healthResponseContains)) return;
		} catch {
			/* The runtime may still be starting. */
		}
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
	}
	throw new Error(
		`${entry.code} did not become healthy at ${url}.\n${running.logs.join('').slice(-4_000)}`,
	);
}

/** Verifies built artifacts before starting the five server fixtures. */
function verifyBuiltArtifacts(): void {
	const required = [
		'express/node_modules/express/package.json',
		'nextjs/.next/BUILD_ID',
		'laravel/vendor/autoload.php',
		'wordpress/vendor/autoload.php',
		'django/.venv/django/__init__.py',
		'vite/dist/index.html',
	];
	for (const file of required)
		if (!existsSync(resolve(FIXTURE_ROOT, file)))
			throw new Error(
				`Missing ${file}. Install and build fixture dependencies before smoke testing.`,
			);
}

/** Runs local process and HTTP acceptance without touching external services. */
async function main(): Promise<void> {
	verifyBuiltArtifacts();
	const running: RunningFixture[] = [];
	try {
		const express = acceptanceCase('express');
		running.push(
			startFixture(
				express.code,
				process.execPath,
				['server.mjs'],
				resolve(FIXTURE_ROOT, 'express'),
				{ ...process.env, PORT: String(BASE_PORT + 1) },
			),
		);

		const nextjs = acceptanceCase('nextjs');
		running.push(
			startFixture(
				nextjs.code,
				process.execPath,
				[
					'node_modules/next/dist/bin/next',
					'start',
					'--hostname',
					'127.0.0.1',
					'--port',
					String(BASE_PORT + 2),
				],
				resolve(FIXTURE_ROOT, 'nextjs'),
			),
		);

		const laravel = acceptanceCase('laravel');
		running.push(
			startFixture(
				laravel.code,
				process.env.FRAMEWORK_ACCEPTANCE_PHP_COMMAND ?? 'php',
				[
					'-S',
					`127.0.0.1:${BASE_PORT + 3}`,
					'-t',
					'.',
					'../vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php',
				],
				resolve(FIXTURE_ROOT, 'laravel/public'),
				{
					...process.env,
					APP_ENV: 'testing',
					APP_KEY: `base64:${randomBytes(32).toString('base64')}`,
					CACHE_STORE: 'file',
					DB_CONNECTION: 'sqlite',
					DB_DATABASE: ':memory:',
					QUEUE_CONNECTION: 'sync',
					SESSION_DRIVER: 'file',
				},
			),
		);

		const wordpress = acceptanceCase('wordpress');
		running.push(
			startFixture(
				wordpress.code,
				process.env.FRAMEWORK_ACCEPTANCE_PHP_COMMAND ?? 'php',
				['-S', `127.0.0.1:${BASE_PORT + 4}`],
				resolve(FIXTURE_ROOT, 'wordpress'),
			),
		);

		const django = acceptanceCase('django');
		const djangoPythonPath =
			process.env.FRAMEWORK_ACCEPTANCE_PYTHONPATH ??
			resolve(FIXTURE_ROOT, 'django/.venv');
		running.push(
			startFixture(
				django.code,
				process.env.FRAMEWORK_ACCEPTANCE_PYTHON_COMMAND ??
					(process.platform === 'win32' ? 'python' : 'python3'),
				[
					'manage.py',
					'runserver',
					`127.0.0.1:${BASE_PORT + 5}`,
					'--noreload',
				],
				resolve(FIXTURE_ROOT, 'django'),
				{
					...process.env,
					PYTHONPATH: djangoPythonPath,
				},
			),
		);

		await Promise.all([
			waitForHealth(running[0]!, express, BASE_PORT + 1),
			waitForHealth(running[1]!, nextjs, BASE_PORT + 2),
			waitForHealth(running[2]!, laravel, BASE_PORT + 3),
			waitForHealth(running[3]!, wordpress, BASE_PORT + 4),
			waitForHealth(running[4]!, django, BASE_PORT + 5),
		]);
		const viteOutput = readFileSync(
			resolve(FIXTURE_ROOT, 'vite/dist/index.html'),
			'utf8',
		);
		if (!viteOutput.includes(acceptanceCase('vite').healthResponseContains))
			throw new Error('Vite production output does not contain its health marker.');
		for (const entry of FRAMEWORK_ACCEPTANCE_CASES)
			console.log(`${entry.code}: local smoke passed.`);
	} finally {
		for (const entry of running)
			if (entry.child.exitCode === null) entry.child.kill();
	}
}

await main();
