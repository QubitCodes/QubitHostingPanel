export const DATABASE_IDENTIFIER_MAX_LENGTH = 63;
export const DATABASE_IDENTIFIER_SUFFIX_MAX_LENGTH = 55;

/** Returns the stable tenant prefix used for newly provisioned database objects. */
export function workspaceDatabaseIdentifierPrefix(workspacePublicId: number): string {
	return `w${workspacePublicId}_`;
}

/** Combines the immutable workspace prefix with a validated customer suffix. */
export function workspaceDatabaseIdentifier(workspacePublicId: number, suffix: string): string {
	const identifier = `${workspaceDatabaseIdentifierPrefix(workspacePublicId)}${suffix}`;
	if (identifier.length > DATABASE_IDENTIFIER_MAX_LENGTH) throw new Error('Database identifier exceeds the platform limit.');
	return identifier;
}
