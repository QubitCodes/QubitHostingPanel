import { z } from 'zod';

const environmentSchema = z.object({
	APP_URL: z.url().default('http://localhost:5173'),
	APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
	ENABLE_AUDIT_LOG: z.enum(['true', 'false']).default('true'),
	DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/ }),
	CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
	FIREBASE_PROJECT_ID: z.string().optional(),
	FIREBASE_CLIENT_EMAIL: z.string().optional(),
	FIREBASE_PRIVATE_KEY: z.string().optional(),
	MSG91_AUTH_KEY: z.string().optional(),
	MSG91_WHATSAPP_NUMBER: z.string().optional(),
	MSG91_OTP_TEMPLATE: z.string().default('common_otp'),
	MSG91_OTP_TEMPLATE_LANGUAGE: z.string().default('en'),
	JWT_ACCESS_SECRET: z.string().optional(),
	JWT_REFRESH_SECRET: z.string().optional(),
	OTP_HASH_SECRET: z.string().optional(),
	ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
	REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
	OTP_TTL_MINUTES: z.coerce.number().int().positive().max(30).default(10),
	OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
	OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().max(10).default(5),
	SUPER_ADMIN_LOCAL_MOBILE: z.string().optional(),
	SUPER_ADMIN_COUNTRY_CALLING_CODE: z.string().optional(),
	SUPER_ADMIN_DISPLAY_NAME: z.string().optional()
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
