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
	JWT_ACCESS_SECRET: z.string().optional(),
	JWT_REFRESH_SECRET: z.string().optional()
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
