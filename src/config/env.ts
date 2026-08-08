import { z } from 'zod';

const optionalEnvironmentSecret = z.preprocess(
	(value) =>
		typeof value === 'string' && value.trim() === '' ? undefined : value,
	z.string().trim().min(1).optional(),
);

const environmentSchema = z
	.object({
		APP_URL: z.url().default('http://localhost:5173'),
		APP_ENV: z
			.enum(['development', 'test', 'production'])
			.default('development'),
		ENABLE_AUDIT_LOG: z.enum(['true', 'false']).default('true'),
		ENABLE_DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
		DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
		CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
		DATABASE_CLUSTER_CONNECTION_MODE: z
			.enum(['internal', 'management'])
			.default('internal'),
		DATABASE_BACKUP_STORAGE_PATH: z
			.string()
			.trim()
			.min(1)
			.default('storage/database-backups'),
		DATABASE_BACKUP_COMMAND_TIMEOUT_SECONDS: z.coerce
			.number()
			.int()
			.min(30)
			.max(86400)
			.default(3600),
		DATABASE_BACKUP_S3_ENDPOINT: optionalEnvironmentSecret,
		DATABASE_BACKUP_S3_REGION: z.string().trim().min(1).default('us-east-1'),
		DATABASE_BACKUP_S3_BUCKET: optionalEnvironmentSecret,
		DATABASE_BACKUP_S3_ACCESS_KEY_ID: optionalEnvironmentSecret,
		DATABASE_BACKUP_S3_SECRET_ACCESS_KEY: optionalEnvironmentSecret,
		DATABASE_BACKUP_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),
		DATABASE_IMPORT_STORAGE_PATH: z.string().trim().min(1).default('storage/database-imports'),
		DATABASE_IMPORT_MAX_MB: z.coerce.number().int().min(1).max(2048).default(100),
		DATABASE_IMPORT_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
		PG_DUMP_PATH: z.string().trim().min(1).default('pg_dump'),
		PG_RESTORE_PATH: z.string().trim().min(1).default('pg_restore'),
		PG_CLIENT_PATH: z.string().trim().min(1).default('psql'),
		MYSQL_DUMP_PATH: z.string().trim().min(1).default('mysqldump'),
		MYSQL_CLIENT_PATH: z.string().trim().min(1).default('mysql'),
		FIREBASE_PROJECT_ID: z.string().optional(),
		FIREBASE_CLIENT_EMAIL: z.string().optional(),
		FIREBASE_PRIVATE_KEY: z.string().optional(),
		MSG91_AUTH_KEY: z.string().optional(),
		MSG91_WHATSAPP_NUMBER: z.string().optional(),
		PAYU_ENABLED: z.enum(['true', 'false']).default('false'),
		PAYU_ENVIRONMENT: z.enum(['test', 'production']).default('test'),
		PAYU_MERCHANT_KEY: optionalEnvironmentSecret,
		PAYU_MERCHANT_SALT: optionalEnvironmentSecret,
		RAZORPAY_ENABLED: z.enum(['true', 'false']).default('false'),
		RAZORPAY_KEY_ID: optionalEnvironmentSecret,
		RAZORPAY_KEY_SECRET: optionalEnvironmentSecret,
		RAZORPAY_WEBHOOK_SECRET: optionalEnvironmentSecret,
		HOSTING_PROVIDER: z.enum(['mock', 'coolify']).default('mock'),
		COOLIFY_ENABLED: z.enum(['true', 'false']).default('false'),
		COOLIFY_BASE_URL: optionalEnvironmentSecret,
		COOLIFY_API_TOKEN: optionalEnvironmentSecret,
		COOLIFY_SERVER_UUID: optionalEnvironmentSecret,
		COOLIFY_DESTINATION_UUID: optionalEnvironmentSecret,
		COOLIFY_DEFAULT_PROJECT_UUID: optionalEnvironmentSecret,
		COOLIFY_DEFAULT_ENVIRONMENT_NAME: z
			.string()
			.trim()
			.min(1)
			.default('production'),
		COOLIFY_WILDCARD_DOMAIN: optionalEnvironmentSecret,
		COOLIFY_STARTER_IMAGE: z.string().trim().min(1).default('nginx'),
		COOLIFY_STARTER_IMAGE_TAG: z.string().trim().min(1).default('alpine'),
		COOLIFY_STARTER_PORT: z
			.string()
			.trim()
			.regex(/^\d{2,5}$/)
			.default('80'),
		CLOUDFLARE_DNS_API_TOKEN: optionalEnvironmentSecret,
		CLOUDFLARE_DNS_ACCOUNT_ID: optionalEnvironmentSecret,
		POWERDNS_API_URL: optionalEnvironmentSecret,
		POWERDNS_API_KEY: optionalEnvironmentSecret,
		POWERDNS_NAMESERVERS: z
			.string()
			.trim()
			.min(1)
			.default('ns1.ghostdeploy.com,ns2.ghostdeploy.com'),
		GITHUB_APP_ID: optionalEnvironmentSecret,
		GITHUB_APP_SLUG: optionalEnvironmentSecret,
		GITHUB_APP_CLIENT_ID: optionalEnvironmentSecret,
		GITHUB_APP_CLIENT_SECRET: optionalEnvironmentSecret,
		GITHUB_APP_PRIVATE_KEY: optionalEnvironmentSecret,
		GITHUB_APP_WEBHOOK_SECRET: optionalEnvironmentSecret,
		GITHUB_APP_STATE_SECRET: optionalEnvironmentSecret,
		COOLIFY_GITHUB_PRIVATE_KEY_UUID: optionalEnvironmentSecret,
		COOLIFY_WEBHOOK_SECRET: optionalEnvironmentSecret,
		INTERNAL_JOB_SECRET: optionalEnvironmentSecret,
		JWT_ACCESS_SECRET: z.string().optional(),
		JWT_REFRESH_SECRET: z.string().optional(),
		OTP_HASH_SECRET: z.string().optional(),
		CHECKOUT_SIGNING_SECRET: z.string().optional(),
		CHECKOUT_TAX_RATE_BPS: z.coerce
			.number()
			.int()
			.min(0)
			.max(10000)
			.default(1800),
		CHECKOUT_QUOTE_TTL_MINUTES: z.coerce
			.number()
			.int()
			.positive()
			.max(60)
			.default(10),
		ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
		REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
		OTP_TTL_MINUTES: z.coerce.number().int().positive().max(30).default(10),
		OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
		OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(5),
	})
	.superRefine((environment, context) => {
		const s3Values = [environment.DATABASE_BACKUP_S3_BUCKET, environment.DATABASE_BACKUP_S3_ACCESS_KEY_ID, environment.DATABASE_BACKUP_S3_SECRET_ACCESS_KEY];
		if (s3Values.some(Boolean) && s3Values.some((value) => !value)) context.addIssue({ code: 'custom', message: 'S3 backup bucket, access key, and secret key must be configured together.', path: ['DATABASE_BACKUP_S3_BUCKET'] });
		if (environment.PAYU_ENABLED === 'true' && !environment.PAYU_MERCHANT_KEY) {
			context.addIssue({
				code: 'custom',
				message: 'PAYU_MERCHANT_KEY is required when PayU is enabled.',
				path: ['PAYU_MERCHANT_KEY'],
			});
		}

		if (
			environment.PAYU_ENABLED === 'true' &&
			!environment.PAYU_MERCHANT_SALT
		) {
			context.addIssue({
				code: 'custom',
				message: 'PAYU_MERCHANT_SALT is required when PayU is enabled.',
				path: ['PAYU_MERCHANT_SALT'],
			});
		}

		if (environment.RAZORPAY_ENABLED === 'true') {
			for (const key of [
				'RAZORPAY_KEY_ID',
				'RAZORPAY_KEY_SECRET',
				'RAZORPAY_WEBHOOK_SECRET',
			] as const)
				if (!environment[key])
					context.addIssue({
						code: 'custom',
						message: `${key} is required when Razorpay is enabled.`,
						path: [key],
					});
		}

		if (
			environment.HOSTING_PROVIDER === 'coolify' ||
			environment.COOLIFY_ENABLED === 'true'
		) {
			for (const key of [
				'COOLIFY_BASE_URL',
				'COOLIFY_API_TOKEN',
				'COOLIFY_SERVER_UUID',
				'COOLIFY_DEFAULT_PROJECT_UUID',
			] as const)
				if (!environment[key])
					context.addIssue({
						code: 'custom',
						message: `${key} is required when Coolify is enabled.`,
						path: [key],
					});
		}

		if (environment.GITHUB_APP_ID) {
			for (const key of [
				'GITHUB_APP_SLUG',
				'GITHUB_APP_CLIENT_ID',
				'GITHUB_APP_CLIENT_SECRET',
				'GITHUB_APP_PRIVATE_KEY',
				'GITHUB_APP_WEBHOOK_SECRET',
				'GITHUB_APP_STATE_SECRET',
				'COOLIFY_GITHUB_PRIVATE_KEY_UUID',
			] as const)
				if (!environment[key])
					context.addIssue({
						code: 'custom',
						message: `${key} is required when GitHub App integration is enabled.`,
						path: [key],
					});
		}
	});

export type AppEnvironment = z.infer<typeof environmentSchema>;

let parsedEnvironment: AppEnvironment | undefined;

/** Lazily validates server environment values so static builds do not require runtime secrets. */
export function getEnvironment(): AppEnvironment {
	parsedEnvironment ??= environmentSchema.parse(process.env);
	return parsedEnvironment;
}

/** Clears the cached environment for deterministic unit tests. */
export function resetEnvironmentForTests(): void {
	parsedEnvironment = undefined;
}
