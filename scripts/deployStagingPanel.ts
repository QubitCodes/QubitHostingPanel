const APPLICATION_NAME = 'ghost-deploy-staging';
const APPLICATION_DOMAIN = 'https://staging.ghostdeploy.com';
const APPLICATION_DOMAINS = APPLICATION_DOMAIN;
const REPOSITORY_URL = process.env.GHOST_DEPLOY_REPOSITORY_URL?.trim() || 'https://github.com/QubitCodes/QubitHostingPanel';
const REQUIRED_COOLIFY_KEYS = ['COOLIFY_API_TOKEN', 'COOLIFY_BASE_URL', 'COOLIFY_DEFAULT_PROJECT_UUID', 'COOLIFY_SERVER_UUID'] as const;
const RUNTIME_SECRET_KEYS = [
	'DATABASE_URL',
	'CREDENTIAL_ENCRYPTION_KEY',
	'CLOUDFLARE_DNS_API_TOKEN',
	'CLOUDFLARE_DNS_ACCOUNT_ID',
	'FIREBASE_PROJECT_ID',
	'FIREBASE_CLIENT_EMAIL',
	'FIREBASE_PRIVATE_KEY',
	'MSG91_AUTH_KEY',
	'MSG91_WHATSAPP_NUMBER',
	'PAYU_ENABLED',
	'PAYU_ENVIRONMENT',
	'PAYU_MERCHANT_KEY',
	'PAYU_MERCHANT_SALT',
	'RAZORPAY_ENABLED',
	'RAZORPAY_KEY_ID',
	'RAZORPAY_KEY_SECRET',
	'RAZORPAY_WEBHOOK_SECRET',
	'INTERNAL_JOB_SECRET',
	'JWT_ACCESS_SECRET',
	'JWT_REFRESH_SECRET',
	'OTP_HASH_SECRET',
	'CHECKOUT_SIGNING_SECRET',
	'CHECKOUT_TAX_RATE_BPS',
	'CHECKOUT_QUOTE_TTL_MINUTES',
	'ACCESS_TOKEN_TTL_MINUTES',
	'REFRESH_TOKEN_TTL_DAYS',
	'OTP_TTL_MINUTES',
	'OTP_RESEND_COOLDOWN_SECONDS',
	'OTP_MAX_ATTEMPTS',
	'ENABLE_AUDIT_LOG',
	'COOLIFY_ENABLED',
	'COOLIFY_BASE_URL',
	'COOLIFY_API_TOKEN',
	'COOLIFY_SERVER_UUID',
	'COOLIFY_DESTINATION_UUID',
	'COOLIFY_DEFAULT_PROJECT_UUID',
	'COOLIFY_DEFAULT_ENVIRONMENT_NAME',
	'COOLIFY_WILDCARD_DOMAIN',
	'COOLIFY_STARTER_IMAGE',
	'COOLIFY_STARTER_IMAGE_TAG',
	'COOLIFY_STARTER_PORT',
	'HOSTING_PROVIDER'
] as const;

interface CoolifyApplication { name?: string; uuid?: string }

/** Calls one Coolify endpoint while keeping credentials and environment values out of logs. */
async function coolifyRequest<T>(path: string, init?: RequestInit): Promise<T> {
	const baseUrl = process.env.COOLIFY_BASE_URL!;
	const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1${path}`, {
		...init,
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${process.env.COOLIFY_API_TOKEN}`,
			...(init?.body ? { 'content-type': 'application/json' } : {})
		},
		signal: AbortSignal.timeout(30_000)
	});
	const text = await response.text();
	const body = text ? JSON.parse(text) as unknown : {};
	if (!response.ok) throw new Error(`Coolify ${response.status}: ${String((body as { message?: unknown }).message ?? 'request failed')}`);
	return body as T;
}

/** Uses Supabase's IPv4 session pooler when the configured direct endpoint is IPv6-only. */
function stagingDatabaseUrl(value: string): string {
	const url = new URL(value);
	const match = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
	if (!match) return value;
	url.hostname = 'aws-1-ap-south-1.pooler.supabase.com';
	url.port = '5432';
	if (url.username === 'postgres') url.username = `postgres.${match[1]}`;
	return url.toString();
}

/** Builds the secure staging runtime environment from the operator's local secret file. */
function runtimeEnvironment(): Record<string, string> {
	const values: Record<string, string> = {};
	for (const key of RUNTIME_SECRET_KEYS) if (process.env[key]?.trim()) values[key] = process.env[key]!;
	if (!values.DATABASE_URL) throw new Error('DATABASE_URL is required.');
	values.DATABASE_URL = stagingDatabaseUrl(values.DATABASE_URL);
	return {
		...values,
		APP_ENV: 'production',
		APP_URL: APPLICATION_DOMAIN,
		DATABASE_CLUSTER_CONNECTION_MODE: 'internal',
		ENABLE_DEV_AUTH_BYPASS: 'false',
		NODE_ENV: 'production',
		NIXPACKS_NODE_VERSION: '24',
		PORT: '3000'
	};
}

/** Creates or updates the single staging panel application and queues a deployment. */
async function main(): Promise<void> {
	for (const key of REQUIRED_COOLIFY_KEYS) if (!process.env[key]?.trim()) throw new Error(`${key} is required.`);
	if (process.env.APP_ENV === 'production' || process.env.APP_URL === APPLICATION_DOMAIN) throw new Error('Run this command from the local operator environment, never from the deployed application.');

	const applications = await coolifyRequest<CoolifyApplication[]>('/applications');
	let applicationUuid = applications.find((application) => application.name === APPLICATION_NAME)?.uuid;
	if (!applicationUuid) {
		const created = await coolifyRequest<{ uuid: string }>('/applications/public', {
			method: 'POST',
			body: JSON.stringify({
				autogenerate_domain: false,
				build_command: 'npm run build',
				build_pack: 'nixpacks',
				description: 'Ghost Deploy staging control plane',
				destination_uuid: process.env.COOLIFY_DESTINATION_UUID || undefined,
				domains: APPLICATION_DOMAINS,
				environment_name: process.env.COOLIFY_DEFAULT_ENVIRONMENT_NAME || 'production',
				force_domain_override: false,
				git_branch: 'main',
				git_repository: REPOSITORY_URL,
				health_check_enabled: true,
				health_check_path: '/api/v1/health',
				health_check_port: '3000',
				install_command: 'npm ci',
				instant_deploy: false,
				is_auto_deploy_enabled: true,
				name: APPLICATION_NAME,
				ports_exposes: '3000',
				project_uuid: process.env.COOLIFY_DEFAULT_PROJECT_UUID,
				server_uuid: process.env.COOLIFY_SERVER_UUID,
				start_command: 'npm run start'
			})
		});
		applicationUuid = created.uuid;
		console.log(`Created staging panel application ${applicationUuid}.`);
	} else {
		await coolifyRequest(`/applications/${encodeURIComponent(applicationUuid)}`, {
			method: 'PATCH',
			body: JSON.stringify({ domains: APPLICATION_DOMAINS, force_domain_override: false, health_check_enabled: true, health_check_path: '/api/v1/health', health_check_port: '3000', ports_exposes: '3000' })
		});
		console.log(`Reusing staging panel application ${applicationUuid}.`);
	}

	for (const [key, value] of Object.entries(runtimeEnvironment())) {
		try {
			await coolifyRequest(`/applications/${encodeURIComponent(applicationUuid)}/envs`, { method: 'POST', body: JSON.stringify({ key, value, is_preview: false, is_literal: true, is_multiline: value.includes('\n') }) });
		} catch (error) {
			if (!(error instanceof Error) || !/already|exists|unique/i.test(error.message)) throw error;
			await coolifyRequest(`/applications/${encodeURIComponent(applicationUuid)}/envs`, { method: 'PATCH', body: JSON.stringify({ key, value, is_preview: false, is_literal: true, is_multiline: value.includes('\n') }) });
		}
	}

	const deployment = await coolifyRequest<{ deployments?: Array<{ deployment_uuid?: string }> }>('/deploy', { method: 'POST', body: JSON.stringify({ force: true, uuid: applicationUuid }) });
	console.log(`Staging panel deployment queued: ${deployment.deployments?.[0]?.deployment_uuid ?? 'accepted'}.`);
}

await main();
