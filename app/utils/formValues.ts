/** Converts an optional form text value into trimmed text or null. */
export function normalizeNullableText(value: unknown): string | null {
	if (typeof value !== 'string') return null;

	return value.trim() || null;
}
