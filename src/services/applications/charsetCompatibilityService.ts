export interface CharsetCompatibilityFix {
	confidence: number;
	convertedSha256: string;
	from: string;
	originalSha256: string;
	path: string;
	to: 'utf-8';
}

const FIX_MARKER = /^GHOSTDEPLOY_CHARSET_FIX\s+(\{.+\})$/gm;

/** Extracts bounded conversion evidence emitted by the platform-controlled builder. */
export function parseCharsetCompatibilityFixes(logs?: string | null): CharsetCompatibilityFix[] {
	if (!logs) return [];
	return [...logs.matchAll(FIX_MARKER)].flatMap((match) => {
		try {
			const value = JSON.parse(match[1] ?? '') as Partial<CharsetCompatibilityFix>;
			if (typeof value.path !== 'string' || typeof value.from !== 'string' || value.to !== 'utf-8' || typeof value.confidence !== 'number' || typeof value.originalSha256 !== 'string' || typeof value.convertedSha256 !== 'string') return [];
			return [{
				confidence: Math.max(0, Math.min(1, value.confidence)),
				convertedSha256: value.convertedSha256.slice(0, 64),
				from: value.from.slice(0, 40),
				originalSha256: value.originalSha256.slice(0, 64),
				path: value.path.slice(0, 500),
				to: 'utf-8' as const,
			}];
		} catch {
			return [];
		}
	});
}
