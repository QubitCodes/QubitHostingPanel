export const RUNTIME_LANGUAGES = [
	'node',
	'php',
	'python',
	'ruby',
	'static',
] as const;

export type RuntimeLanguage = (typeof RUNTIME_LANGUAGES)[number];

export interface FrameworkDefinition {
	code: string;
	databaseEngines: Array<'mysql' | 'postgresql'>;
	defaultPort: number;
	description: string;
	label: string;
	language: RuntimeLanguage;
	outputDirectory?: string;
	persistentDirectories?: string[];
	release?: {
		migrationCommand: string;
		seederCommand?: string;
	};
	schedulerPreset?:
		| 'custom-command'
		| 'django-command'
		| 'laravel'
		| 'rails-command'
		| 'wordpress';
	workerPreset?: 'celery' | 'laravel-queue' | 'messenger' | 'rails-queue';
}

/** Shared customer-facing framework capabilities used by detection and deployment UI. */
export const FRAMEWORK_CATALOG = [
	{
		code: 'react-router',
		label: 'React Router',
		language: 'node',
		defaultPort: 3000,
		description: 'Server-rendered or full-stack React Router application.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'nextjs',
		label: 'Next.js',
		language: 'node',
		defaultPort: 3000,
		description: 'Next.js server or hybrid application.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'nestjs',
		label: 'NestJS',
		language: 'node',
		defaultPort: 3000,
		description: 'NestJS API or application server.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'express',
		label: 'Express',
		language: 'node',
		defaultPort: 3000,
		description: 'Express application server.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'fastify',
		label: 'Fastify',
		language: 'node',
		defaultPort: 3000,
		description: 'Fastify application server.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'remix',
		label: 'Remix',
		language: 'node',
		defaultPort: 3000,
		description: 'Remix server-rendered application.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'nuxt',
		label: 'Nuxt',
		language: 'node',
		defaultPort: 3000,
		description: 'Nuxt server-rendered application.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'sveltekit',
		label: 'SvelteKit',
		language: 'node',
		defaultPort: 3000,
		description: 'SvelteKit application using a Node-compatible adapter.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'laravel',
		label: 'Laravel',
		language: 'php',
		defaultPort: 80,
		description: 'Laravel web application.',
		databaseEngines: ['postgresql', 'mysql'],
		persistentDirectories: ['storage/app/public'],
		release: {
			migrationCommand: 'php artisan migrate --force --no-interaction',
			seederCommand: 'php artisan db:seed --force --no-interaction',
		},
		schedulerPreset: 'laravel',
		workerPreset: 'laravel-queue',
	},
	{
		code: 'wordpress',
		label: 'WordPress',
		language: 'php',
		defaultPort: 80,
		description: 'WordPress site with persistent content storage.',
		databaseEngines: ['mysql'],
		persistentDirectories: ['wp-content'],
		schedulerPreset: 'wordpress',
	},
	{
		code: 'cakephp',
		label: 'CakePHP',
		language: 'php',
		defaultPort: 80,
		description: 'CakePHP web application.',
		databaseEngines: ['postgresql', 'mysql'],
		persistentDirectories: ['logs', 'tmp'],
		release: {
			migrationCommand: 'bin/cake migrations migrate',
			seederCommand: 'bin/cake migrations seed',
		},
		schedulerPreset: 'custom-command',
	},
	{
		code: 'symfony',
		label: 'Symfony',
		language: 'php',
		defaultPort: 80,
		description: 'Symfony web application.',
		databaseEngines: ['postgresql', 'mysql'],
		persistentDirectories: ['var'],
		release: {
			migrationCommand: 'php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration',
		},
		schedulerPreset: 'custom-command',
		workerPreset: 'messenger',
	},
	{
		code: 'codeigniter',
		label: 'CodeIgniter',
		language: 'php',
		defaultPort: 80,
		description: 'CodeIgniter web application.',
		databaseEngines: ['postgresql', 'mysql'],
		persistentDirectories: ['writable'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'yii',
		label: 'Yii',
		language: 'php',
		defaultPort: 80,
		description: 'Yii web application.',
		databaseEngines: ['postgresql', 'mysql'],
		persistentDirectories: ['runtime', 'web/assets'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'slim',
		label: 'Slim',
		language: 'php',
		defaultPort: 80,
		description: 'Slim PHP application.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'django',
		label: 'Django',
		language: 'python',
		defaultPort: 8000,
		description: 'Django web application.',
		databaseEngines: ['postgresql', 'mysql'],
		persistentDirectories: ['media'],
		release: {
			migrationCommand: 'python manage.py migrate --noinput',
		},
		schedulerPreset: 'django-command',
		workerPreset: 'celery',
	},
	{
		code: 'fastapi',
		label: 'FastAPI',
		language: 'python',
		defaultPort: 8000,
		description: 'FastAPI application server.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
		workerPreset: 'celery',
	},
	{
		code: 'flask',
		label: 'Flask',
		language: 'python',
		defaultPort: 8000,
		description: 'Flask application server.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
		workerPreset: 'celery',
	},
	{
		code: 'litestar',
		label: 'Litestar',
		language: 'python',
		defaultPort: 8000,
		description: 'Litestar application server.',
		databaseEngines: ['postgresql', 'mysql'],
		schedulerPreset: 'custom-command',
	},
	{
		code: 'rails',
		label: 'Ruby on Rails',
		language: 'ruby',
		defaultPort: 3000,
		description: 'Ruby on Rails web application.',
		databaseEngines: ['postgresql', 'mysql'],
		persistentDirectories: ['storage'],
		release: {
			migrationCommand: 'bundle exec rails db:migrate',
			seederCommand: 'bundle exec rails db:seed',
		},
		schedulerPreset: 'rails-command',
		workerPreset: 'rails-queue',
	},
	{
		code: 'react',
		label: 'React',
		language: 'static',
		defaultPort: 80,
		description: 'Static React build.',
		databaseEngines: [],
		outputDirectory: 'dist',
	},
	{
		code: 'vite',
		label: 'Vite',
		language: 'static',
		defaultPort: 80,
		description: 'Static Vite build.',
		databaseEngines: [],
		outputDirectory: 'dist',
	},
	{
		code: 'vue',
		label: 'Vue',
		language: 'static',
		defaultPort: 80,
		description: 'Static Vue build.',
		databaseEngines: [],
		outputDirectory: 'dist',
	},
	{
		code: 'angular',
		label: 'Angular',
		language: 'static',
		defaultPort: 80,
		description: 'Static Angular build.',
		databaseEngines: [],
		outputDirectory: 'dist',
	},
	{
		code: 'astro',
		label: 'Astro',
		language: 'static',
		defaultPort: 80,
		description: 'Static Astro build.',
		databaseEngines: [],
		outputDirectory: 'dist',
	},
	{
		code: 'gatsby',
		label: 'Gatsby',
		language: 'static',
		defaultPort: 80,
		description: 'Static Gatsby build.',
		databaseEngines: [],
		outputDirectory: 'public',
	},
] as const satisfies readonly FrameworkDefinition[];

export function frameworksForLanguage(
	language: RuntimeLanguage,
): FrameworkDefinition[] {
	return FRAMEWORK_CATALOG.filter(
		(framework) => framework.language === language,
	);
}

export function frameworkDefinition(
	code?: string | null,
): FrameworkDefinition | undefined {
	return FRAMEWORK_CATALOG.find((framework) => framework.code === code);
}
