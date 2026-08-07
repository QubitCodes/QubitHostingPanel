import type { RuntimeLanguage } from '@config/frameworkCatalog';

export type AcceptanceDatabaseMode =
	| 'none'
	| 'required-mysql'
	| 'required-postgresql';

export interface FrameworkAcceptanceCase {
	buildCommand?: string;
	buildPack: 'nixpacks' | 'static';
	code: string;
	databaseMode: AcceptanceDatabaseMode;
	fixtureDirectory: string;
	healthPath: string;
	healthResponseContains: string;
	installCommand?: string;
	persistenceDirectories: string[];
	port: number;
	publishDirectory?: string;
	requiredFiles: string[];
	runtimeCode: string;
	stack: RuntimeLanguage;
	startCommand?: string;
}

/**
 * First acceptance batch. Entries are executable specifications, not claims of
 * live production verification. Live evidence is recorded only by the
 * acceptance reporter after a real Ghost Deploy deployment succeeds.
 */
export const FRAMEWORK_ACCEPTANCE_CASES: readonly FrameworkAcceptanceCase[] = [
	{
		code: 'express',
		stack: 'node',
		runtimeCode: 'node-22',
		fixtureDirectory: 'fixtures/frameworks/express',
		buildPack: 'nixpacks',
		installCommand: 'npm ci',
		startCommand: 'npm run start',
		port: 3000,
		healthPath: '/',
		healthResponseContains: '"framework":"express"',
		databaseMode: 'none',
		persistenceDirectories: [],
		requiredFiles: ['package.json', 'package-lock.json', 'server.mjs'],
	},
	{
		code: 'nextjs',
		stack: 'node',
		runtimeCode: 'node-22',
		fixtureDirectory: 'fixtures/frameworks/nextjs',
		buildPack: 'nixpacks',
		installCommand: 'npm ci',
		buildCommand: 'npm run build',
		startCommand: 'npm run start',
		port: 3000,
		healthPath: '/api/health',
		healthResponseContains: '"framework":"nextjs"',
		databaseMode: 'none',
		persistenceDirectories: [],
		requiredFiles: [
			'package.json',
			'package-lock.json',
			'next.config.mjs',
			'app/page.js',
			'app/api/health/route.js',
		],
	},
	{
		code: 'laravel',
		stack: 'php',
		runtimeCode: 'php-8.3',
		fixtureDirectory: 'fixtures/frameworks/laravel',
		buildPack: 'nixpacks',
		installCommand:
			'composer install --no-interaction --prefer-dist --optimize-autoloader',
		startCommand: 'php artisan serve --host=0.0.0.0 --port=$PORT',
		port: 80,
		healthPath: '/healthz',
		healthResponseContains: '"framework":"laravel"',
		databaseMode: 'required-postgresql',
		persistenceDirectories: ['storage/app/public'],
		requiredFiles: [
			'artisan',
			'composer.json',
			'composer.lock',
			'public/index.php',
			'routes/web.php',
		],
	},
	{
		code: 'wordpress',
		stack: 'php',
		runtimeCode: 'php-8.3',
		fixtureDirectory: 'fixtures/frameworks/wordpress',
		buildPack: 'nixpacks',
		installCommand:
			'composer install --no-interaction --prefer-dist --optimize-autoloader',
		startCommand: 'php -S 0.0.0.0:$PORT',
		port: 80,
		healthPath: '/health.php',
		healthResponseContains: '"framework":"wordpress"',
		databaseMode: 'required-mysql',
		persistenceDirectories: ['wp-content'],
		requiredFiles: [
			'composer.json',
			'composer.lock',
			'health.php',
			'index.php',
			'wp-config.php',
			'wp-includes/version.php',
		],
	},
	{
		code: 'django',
		stack: 'python',
		runtimeCode: 'python-3.12',
		fixtureDirectory: 'fixtures/frameworks/django',
		buildPack: 'nixpacks',
		installCommand: 'pip install -r requirements.txt',
		startCommand:
			'gunicorn fixture.wsgi:application --bind 0.0.0.0:$PORT',
		port: 8000,
		healthPath: '/',
		healthResponseContains: '"framework": "django"',
		databaseMode: 'required-postgresql',
		persistenceDirectories: ['media'],
		requiredFiles: [
			'manage.py',
			'requirements.txt',
			'fixture/settings.py',
			'fixture/urls.py',
			'fixture/wsgi.py',
		],
	},
	{
		code: 'vite',
		stack: 'static',
		runtimeCode: 'static-nginx',
		fixtureDirectory: 'fixtures/frameworks/vite',
		buildPack: 'static',
		installCommand: 'npm ci',
		buildCommand: 'npm run build',
		publishDirectory: 'dist',
		port: 80,
		healthPath: '/',
		healthResponseContains: 'Vite acceptance fixture is healthy.',
		databaseMode: 'none',
		persistenceDirectories: [],
		requiredFiles: ['package.json', 'package-lock.json', 'index.html', 'src/main.js'],
	},
];

/** Returns a maintained acceptance specification by framework code. */
export function frameworkAcceptanceCase(
	code: string,
): FrameworkAcceptanceCase | undefined {
	return FRAMEWORK_ACCEPTANCE_CASES.find((entry) => entry.code === code);
}
