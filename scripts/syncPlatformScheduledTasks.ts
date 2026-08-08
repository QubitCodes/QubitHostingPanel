interface CoolifyApplication {
	fqdn?: string | null;
	name?: string;
	uuid?: string;
}

interface CoolifyScheduledTask {
	command?: string;
	enabled?: boolean;
	frequency?: string;
	name?: string;
	timeout?: number;
	uuid?: string;
}

const desiredTasks = [
	{
		command: 'npm run jobs:process',
		enabled: true,
		frequency: '*/5 * * * *',
		name: 'Ghost Deploy provisioning worker',
		timeout: 300,
	},
	{
		command: 'npm run provider:reconcile',
		enabled: true,
		frequency: '*/15 * * * *',
		name: 'Ghost Deploy provider reconciliation',
		timeout: 600,
	},
	{
		command: 'npm run usage:observe',
		enabled: true,
		frequency: '7,22,37,52 * * * *',
		name: 'Ghost Deploy usage observation',
		timeout: 900,
	},
	{
		command: 'npm run operations:readiness',
		enabled: true,
		frequency: '12,27,42,57 * * * *',
		name: 'Ghost Deploy readiness report',
		timeout: 300,
	},
] as const;

const baseUrl = process.env.COOLIFY_BASE_URL?.trim().replace(/\/$/, '');
const token = process.env.COOLIFY_API_TOKEN?.trim();
const appUrl = process.env.APP_URL?.trim();
const apply = process.argv.includes('--apply');
if (!baseUrl || !token || !appUrl)
	throw new Error('COOLIFY_BASE_URL, COOLIFY_API_TOKEN, and APP_URL are required.');
const configuredBaseUrl = baseUrl;
const configuredToken = token;
const configuredAppUrl = appUrl;

/** Calls Coolify without including credentials or response bodies in thrown errors. */
async function coolifyRequest<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${configuredBaseUrl}/api/v1${path}`, {
		...init,
		headers: {
			accept: 'application/json',
			authorization: `Bearer ${configuredToken}`,
			...(init?.body ? { 'content-type': 'application/json' } : {}),
		},
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) throw new Error(`Coolify request failed with HTTP ${response.status}.`);
	const text = await response.text();
	return (text ? JSON.parse(text) : {}) as T;
}

/** Finds the panel application by an explicit UUID or an exact APP_URL hostname. */
async function resolvePanelApplicationUuid(): Promise<string> {
	const explicit = process.argv
		.find((value) => value.startsWith('--application-uuid='))
		?.split('=')[1]
		?.trim() || process.env.COOLIFY_PANEL_APPLICATION_UUID?.trim();
	if (explicit) return explicit;
	const targetHostname = new URL(configuredAppUrl).hostname.toLowerCase();
	const applications = await coolifyRequest<CoolifyApplication[]>('/applications');
	const matching = applications.filter((application) =>
		String(application.fqdn ?? '')
			.split(',')
			.some((value) => {
				try {
					return new URL(value.trim()).hostname.toLowerCase() === targetHostname;
				} catch {
					return false;
				}
			}),
	);
	if (matching.length !== 1 || !matching[0]?.uuid)
		throw new Error('Unable to resolve exactly one Coolify panel application.');
	return matching[0].uuid;
}

const applicationUuid = await resolvePanelApplicationUuid();
const result = await coolifyRequest<CoolifyScheduledTask[] | { data?: CoolifyScheduledTask[] }>(
	`/applications/${encodeURIComponent(applicationUuid)}/scheduled-tasks`,
);
const currentTasks = Array.isArray(result) ? result : result.data ?? [];
const actions: Array<{ action: 'create' | 'unchanged' | 'update'; name: string }> = [];

for (const desired of desiredTasks) {
	const current = currentTasks.find((task) => task.name === desired.name);
	const unchanged = current
		&& current.command === desired.command
		&& current.enabled === desired.enabled
		&& current.frequency === desired.frequency
		&& Number(current.timeout) === desired.timeout;
	if (unchanged) {
		actions.push({ action: 'unchanged', name: desired.name });
		continue;
	}
	const action = current ? 'update' : 'create';
	actions.push({ action, name: desired.name });
	if (!apply) continue;
	if (current?.uuid) {
		await coolifyRequest(
			`/applications/${encodeURIComponent(applicationUuid)}/scheduled-tasks/${encodeURIComponent(current.uuid)}`,
			{ method: 'PATCH', body: JSON.stringify(desired) },
		);
	} else {
		await coolifyRequest(
			`/applications/${encodeURIComponent(applicationUuid)}/scheduled-tasks`,
			{ method: 'POST', body: JSON.stringify(desired) },
		);
	}
}

console.log(JSON.stringify({ actions, applicationUuid, dryRun: !apply }, null, 2));
