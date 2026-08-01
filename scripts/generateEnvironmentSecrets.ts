import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SECRET_KEYS = ['OTP_HASH_SECRET', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;
const environmentPath = resolve('.env');

/** Adds missing application secrets without replacing existing configured values or printing secret material. */
async function generateEnvironmentSecrets(): Promise<void> {
	let contents = await readFile(environmentPath, 'utf8');
	const lineEnding = contents.includes('\r\n') ? '\r\n' : '\n';
	const generated: string[] = [];
	const retained: string[] = [];

	for (const key of SECRET_KEYS) {
		const expression = new RegExp(`^${key}=(.*)$`, 'm');
		const match = contents.match(expression);
		if (match?.[1]?.trim()) {
			retained.push(key);
			continue;
		}
		const value = randomBytes(48).toString('base64url');
		if (match) contents = contents.replace(expression, `${key}=${value}`);
		else contents = `${contents.trimEnd()}${lineEnding}${key}=${value}${lineEnding}`;
		generated.push(key);
	}

	await writeFile(environmentPath, contents, 'utf8');
	console.info(`Generated ${generated.length} missing secrets; retained ${retained.length} existing secrets.`);
}

await generateEnvironmentSecrets();
