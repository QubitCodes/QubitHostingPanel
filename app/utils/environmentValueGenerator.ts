export type EnvironmentValueKind =
	| 'boolean'
	| 'password'
	| 'secret'
	| 'uuid'
	| 'hex'
	| 'base64url'
	| 'integer'
	| 'configuration'
	| 'hash'
	| 'framework';

const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%_-';
const SECRET_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/** Infers the most useful value tool from a conventional environment-variable key. */
export function inferEnvironmentValueKind(key: string): EnvironmentValueKind {
	const normalized = key.trim().toUpperCase();
	if (/(?:^|_)(?:ENABLED|DISABLED|DEBUG)$/.test(normalized) || normalized.startsWith('IS_')) return 'boolean';
	if (/(?:PASSWORD|PASSWD|PASS)$/.test(normalized)) return 'password';
	if (/^(?:TZ|TIMEZONE|APP_TIMEZONE|LOCALE|APP_LOCALE|LANG|LC_ALL|COUNTRY|CURRENCY)$/.test(normalized)) return 'configuration';
	if (/(?:URL|URI|DSN|HOST|PORT|DATABASE|DB_NAME|DB_USER|USERNAME)$/.test(normalized)) return 'configuration';
	if (/(?:UUID|_ID)$/.test(normalized)) return 'uuid';
	if (/(?:SECRET|TOKEN|KEY|SALT)$/.test(normalized)) return 'framework';
	return 'secret';
}

export interface EnvironmentConfigurationValue {
	label: string;
	secret?: boolean;
	value: string;
}

const CONFIGURATION_MATCHERS: Array<[RegExp, string]> = [
	[/^(?:APP_NAME|APPLICATION_NAME|PROJECT_NAME)$/, 'Application name'],
	[/^(?:APP_URL|APPLICATION_URL|BASE_URL|SITE_URL)$/, 'Application URL'],
	[/^(?:HOST|APP_HOST|APPLICATION_HOST|HOSTNAME)$/, 'Hostname'],
	[/^(?:PORT|APP_PORT|APPLICATION_PORT)$/, 'Application port'],
	[/^(?:NODE_ENV|APP_ENV|ENVIRONMENT)$/, 'Environment'],
	[/^(?:DB_CONNECTION|DB_ENGINE|DATABASE_TYPE|DATABASE_ENGINE)$/, 'Database type'],
	[/^(?:DB_HOST|DATABASE_HOST)$/, 'Database host'],
	[/^(?:DB_PORT|DATABASE_PORT)$/, 'Database port'],
	[/^(?:DB_DATABASE|DB_NAME|DATABASE_NAME|DATABASE)$/, 'Database name'],
	[/^(?:DB_USERNAME|DB_USER|DATABASE_USERNAME|DATABASE_USER)$/, 'Database username'],
	[/^(?:DB_PASSWORD|DATABASE_PASSWORD)$/, 'Database password'],
	[/^(?:DATABASE_URL|DB_URL|DB_DSN|DATABASE_DSN)$/, 'Database URL'],
	[/^(?:TZ|TIMEZONE|APP_TIMEZONE)$/, 'Timezone'],
	[/^(?:LOCALE|APP_LOCALE)$/, 'Locale'],
	[/^(?:LANG|LC_ALL)$/, 'POSIX locale'],
	[/^COUNTRY$/, 'Country'],
	[/^CURRENCY$/, 'Currency'],
];

/** Chooses the safest configuration source for a conventional environment key. */
export function bestEnvironmentConfigurationLabel(key: string, values: EnvironmentConfigurationValue[]): string {
	const normalized = key.trim().toUpperCase();
	const exact = CONFIGURATION_MATCHERS.find(([pattern]) => pattern.test(normalized))?.[1];
	if (exact && values.some(({ label }) => label === exact)) return exact;
	const keyWords = normalized.split('_').filter((word) => word.length > 2);
	const scored = values.map(({ label }) => ({
		label,
		score: keyWords.filter((word) => label.toUpperCase().includes(word)).length,
	})).sort((left, right) => right.score - left.score);
	return scored[0]?.score ? scored[0].label : '';
}

const CURRENCY_BY_COUNTRY: Record<string, string> = { AU: 'AUD', CA: 'CAD', CH: 'CHF', DE: 'EUR', FR: 'EUR', GB: 'GBP', IN: 'INR', JP: 'JPY', SG: 'SGD', US: 'USD' };

/** Normalizes browser regional preferences into common environment formats. */
export function regionalEnvironmentConfiguration(locale: string, timezone: string): EnvironmentConfigurationValue[] {
	let country = '';
	try { country = new Intl.Locale(locale).region ?? ''; } catch { country = ''; }
	const normalizedLocale = locale || 'en';
	return [
		{ label: 'Timezone', value: timezone || 'UTC' },
		{ label: 'UTC timezone', value: 'UTC' },
		{ label: 'Locale', value: normalizedLocale },
		{ label: 'POSIX locale', value: `${normalizedLocale.replace('-', '_')}.UTF-8` },
		{ label: 'Country', value: country },
		{ label: 'Currency', value: CURRENCY_BY_COUNTRY[country] ?? '' },
	];
}

/** Returns unbiased random characters using the browser cryptography provider. */
function secureCharacters(length: number, alphabet: string): string {
	const output: string[] = [];
	const maximum = Math.floor(256 / alphabet.length) * alphabet.length;
	while (output.length < length) {
		const bytes = crypto.getRandomValues(new Uint8Array(Math.max(16, length - output.length)));
		for (const byte of bytes) {
			if (byte >= maximum) continue;
			output.push(alphabet[byte % alphabet.length] ?? 'x');
			if (output.length === length) break;
		}
	}
	return output.join('');
}

/** Generates a synchronous environment value without contacting the server. */
export function generateEnvironmentValue(input: {
	booleanValue?: boolean;
	framework?: string;
	integerMaximum?: number;
	integerMinimum?: number;
	kind: Exclude<EnvironmentValueKind, 'configuration' | 'hash'>;
	length?: number;
}): string {
	const length = Math.max(8, Math.min(256, input.length ?? 32));
	if (input.kind === 'boolean') return String(input.booleanValue ?? true);
	if (input.kind === 'uuid') return crypto.randomUUID();
	if (input.kind === 'integer') {
		const minimum = Math.trunc(input.integerMinimum ?? 1);
		const maximum = Math.max(minimum, Math.trunc(input.integerMaximum ?? 65_535));
		const random = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
		return String(minimum + (random % (maximum - minimum + 1)));
	}
	if (input.kind === 'hex') {
		return Array.from(crypto.getRandomValues(new Uint8Array(Math.ceil(length / 2))), (value) => value.toString(16).padStart(2, '0')).join('').slice(0, length);
	}
	if (input.kind === 'base64url') return secureCharacters(length, SECRET_ALPHABET);
	if (input.kind === 'framework') {
		if (input.framework === 'laravel') {
			const bytes = crypto.getRandomValues(new Uint8Array(32));
			return `base64:${btoa(String.fromCharCode(...bytes))}`;
		}
		if (input.framework === 'rails') return generateEnvironmentValue({ kind: 'hex', length: 128 });
		if (input.framework === 'django') return secureCharacters(Math.max(50, length), `${SECRET_ALPHABET}!@#$%^&*()-=`);
	}
	if (input.kind === 'password') {
		const body = secureCharacters(Math.max(12, length - 4), PASSWORD_ALPHABET);
		return `Aa7!${body}`.slice(0, length);
	}
	return secureCharacters(length, SECRET_ALPHABET);
}

/** Creates a one-way browser-side digest for checksum-style environment values. */
export async function hashEnvironmentValue(source: string, algorithm: 'SHA-256' | 'SHA-512'): Promise<string> {
	const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(source));
	return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
