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
	if (/(?:URL|URI|DSN|HOST|PORT|DATABASE|DB_NAME|DB_USER|USERNAME)$/.test(normalized)) return 'configuration';
	if (/(?:UUID|_ID)$/.test(normalized)) return 'uuid';
	if (/(?:SECRET|TOKEN|KEY|SALT)$/.test(normalized)) return 'framework';
	return 'secret';
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
