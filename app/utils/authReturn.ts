/** Accepts only same-origin application paths as post-authentication destinations. */
export function safeAuthenticationReturn(value: string | null): string | undefined {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) return undefined;
	return value;
}
