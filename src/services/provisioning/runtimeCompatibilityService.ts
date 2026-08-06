const MAXIMUM_NIXPACKS_NODE_MAJOR = 22;

/**
 * Converts a catalogue runtime version into a version understood by the
 * Nixpacks image currently shipped with Coolify. Nixpacks resolves Node by
 * major package name (for example, `nodejs_22`) and currently cannot resolve
 * `nodejs_24` from its pinned Nix package set.
 */
export function nixpacksRuntimeVersion(
	language: string,
	version: string,
): string {
	if (language !== 'node') return version;
	const requestedMajor = Number.parseInt(version.split('.')[0] ?? '', 10);
	if (!Number.isFinite(requestedMajor)) return String(MAXIMUM_NIXPACKS_NODE_MAJOR);
	return String(Math.min(requestedMajor, MAXIMUM_NIXPACKS_NODE_MAJOR));
}
