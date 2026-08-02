import { z } from 'zod';

const optionalEnvironmentSecret = z.preprocess(
	(value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
	z.string().trim().min(1).optional()
);

const environmentSchema = z.object({
	APP_URL: z.url().default('http://localhost:5173'),
	APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
	ENABLE_AUDIT_LOG: z.enum(['true', 'false']).default('true'),
	ENABLE_DEV_AUTH_BYPASS: z.enum(['true', 'false']).default('false'),
	DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
	CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
	FIREBASE_PROJECT_ID: z.string().optional(),
	FIREBASE_CLIENT_EMAIL: z.string().optional(),
	FIREBASE_PRIVATE_KEY: z.string().optional(),
	MSG91_AUTH_KEY: z.string().optional(),
	MSG91_WHATSAPP_NUMBER: z.string().optional(),
	PAYU_ENABLED: z.enum(['true', 'false']).default('false'),
	PAYU_ENVIRONMENT: z.enum(['test', 'production']).default('test'),
	PAYU_MERCHANT_KEY: optionalEnvironmentSecret,
	PAYU_MERCHANT_SALT: optionalEnvironmentSecret,
	JWT_ACCESS_SECRET: z.string().optional(),
	JWT_REFRESH_SECRET: z.string().optional(),
	OTP_HASH_SECRET: z.string().optional(),
	CHECKOUT_SIGNING_SECRET: z.string().optional(),
	CHECKOUT_TAX_RATE_BPS: z.coerce.number().int().min(0).max(10000).default(1800),
	CHECKOUT_QUOTE_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(10),
	ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
	REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
	OTP_TTL_MINUTES: z.coerce.number().int().positive().max(30).default(10),
	OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
	OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(5)

}).superRefine((environment, context) => {
	if (environment.PAYU_ENABLED !== 'true') return;

	if (!environment.PAYU_MERCHANT_KEY) {
		context.addIssue({ code: 'custom', message: 'PAYU_MERCHANT_KEY is required when PayU is enabled.', path: ['PAYU_MERCHANT_KEY'] });
	}

	if (!environment.PAYU_MERCHANT_SALT) {
		context.addIssue({ code: 'custom', message: 'PAYU_MERCHANT_SALT is required when PayU is enabled.', path: ['PAYU_MERCHANT_SALT'] });
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
