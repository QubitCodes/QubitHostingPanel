import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const FIXTURE_ROOT = resolve(process.cwd(), 'fixtures/frameworks');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const composerCommand =
	process.env.FRAMEWORK_ACCEPTANCE_COMPOSER_COMMAND ??
	(process.platform === 'win32' ? 'composer.bat' : 'composer');
const pythonCommand =
	process.env.FRAMEWORK_ACCEPTANCE_PYTHON_COMMAND ??
	(process.platform === 'win32' ? 'python' : 'python3');

/** Runs one deterministic fixture preparation step with inherited diagnostics. */
function run(
	label: string,
	command: string,
	args: string[],
	directory: string,
): void {
	console.log(`Preparing ${label}...`);
	const usesWindowsBatch =
		process.platform === 'win32' && /\.(?:bat|cmd)$/i.test(command);
	const result = spawnSync(
		usesWindowsBatch ? (process.env.ComSpec ?? 'cmd.exe') : command,
		usesWindowsBatch ? ['/d', '/s', '/c', command, ...args] : args,
		{
			cwd: resolve(FIXTURE_ROOT, directory),
			stdio: 'inherit',
			windowsHide: true,
		},
	);
	if (result.error) throw result.error;
	if (result.status !== 0)
		throw new Error(`${label} preparation exited with ${result.status}.`);
}

run('Express dependencies', npmCommand, ['ci'], 'express');
run('Next.js dependencies', npmCommand, ['ci'], 'nextjs');
run('Next.js production output', npmCommand, ['run', 'build'], 'nextjs');
run('Vite dependencies', npmCommand, ['ci'], 'vite');
run('Vite production output', npmCommand, ['run', 'build'], 'vite');
run(
	'Laravel dependencies',
	composerCommand,
	['install', '--no-interaction', '--prefer-dist', '--optimize-autoloader'],
	'laravel',
);
run(
	'WordPress dependencies',
	composerCommand,
	['install', '--no-interaction', '--prefer-dist', '--optimize-autoloader'],
	'wordpress',
);
run(
	'Django dependencies',
	pythonCommand,
	[
		'-m',
		'pip',
		'install',
		'--disable-pip-version-check',
		'--ignore-installed',
		'--target',
		'.venv',
		'--upgrade',
		'-r',
		'requirements.txt',
	],
	'django',
);

console.log('Prepared all maintained framework fixtures.');
