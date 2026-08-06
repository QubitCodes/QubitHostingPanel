export interface ParsedEnvEntry {
	key: string;
	line: number;
	value: string;
}

export interface ParsedEnvFile {
	duplicateKeys: string[];
	entries: ParsedEnvEntry[];
	invalidLines: Array<{ line: number; reason: string }>;
}

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_KEY = /(?:secret|token|password|passwd|private|credential|api_key|auth|database_url|dsn)/i;

/** Determines the default visibility of a newly imported environment variable. */
export function isLikelySecretEnvKey(key: string): boolean {
	return SECRET_KEY.test(key);
}

/** Locates a closing quote while respecting backslash escapes in double-quoted values. */
function closingQuoteIndex(value: string, quote: '"' | "'"): number {
	for (let index = 1; index < value.length; index += 1) {
		if (value[index] !== quote) continue;
		if (quote === '"') {
			let slashes = 0;
			for (let position = index - 1; position >= 0 && value[position] === '\\'; position -= 1) slashes += 1;
			if (slashes % 2 === 1) continue;
		}
		return index;
	}
	return -1;
}

/** Decodes a dotenv value without expanding variable references. */
function decodeValue(rawValue: string): { reason?: string; value?: string } {
	const value = rawValue.trimStart();
	if (!value.startsWith('"') && !value.startsWith("'")) {
		const comment = value.search(/\s#/);
		return { value: (comment >= 0 ? value.slice(0, comment) : value).trim() };
	}
	const quote = value[0] as '"' | "'";
	const end = closingQuoteIndex(value, quote);
	if (end < 0) return { reason: 'Quoted value is not terminated.' };
	const trailing = value.slice(end + 1).trim();
	if (trailing && !trailing.startsWith('#')) return { reason: 'Unexpected content after quoted value.' };
	const inner = value.slice(1, end);
	if (quote === "'") return { value: inner };
	return {
		value: inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
	};
}

/** Parses user-supplied dotenv text locally while retaining useful line errors. */
export function parseEnvFile(source: string): ParsedEnvFile {
	const lines = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
	const entries = new Map<string, ParsedEnvEntry>();
	const duplicateKeys = new Set<string>();
	const invalidLines: ParsedEnvFile['invalidLines'] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const startLine = index + 1;
		let line = lines[index] ?? '';
		if (!line.trim() || line.trimStart().startsWith('#')) continue;
		line = line.replace(/^\s*export\s+/, '');
		const separator = line.indexOf('=');
		if (separator < 0) {
			invalidLines.push({ line: startLine, reason: 'Missing equals sign.' });
			continue;
		}
		const rawKey = line.slice(0, separator).trim();
		if (!ENV_KEY.test(rawKey)) {
			invalidLines.push({ line: startLine, reason: 'Invalid variable name.' });
			continue;
		}
		if (rawKey.length > 120) {
			invalidLines.push({ line: startLine, reason: 'Variable name exceeds 120 characters.' });
			continue;
		}
		let rawValue = line.slice(separator + 1);
		const trimmedValue = rawValue.trimStart();
		if (trimmedValue.startsWith('"') || trimmedValue.startsWith("'")) {
			const quote = trimmedValue[0] as '"' | "'";
			while (closingQuoteIndex(rawValue.trimStart(), quote) < 0 && index + 1 < lines.length) {
				index += 1;
				rawValue += `\n${lines[index] ?? ''}`;
			}
		}
		const decoded = decodeValue(rawValue);
		if (decoded.value === undefined) {
			invalidLines.push({ line: startLine, reason: decoded.reason ?? 'Invalid value.' });
			continue;
		}
		if (decoded.value.length > 16_384) {
			invalidLines.push({ line: startLine, reason: 'Value exceeds 16,384 characters.' });
			continue;
		}
		const key = rawKey.toUpperCase();
		if (entries.has(key)) duplicateKeys.add(key);
		entries.set(key, { key, line: startLine, value: decoded.value });
	}

	return { duplicateKeys: [...duplicateKeys], entries: [...entries.values()], invalidLines };
}
