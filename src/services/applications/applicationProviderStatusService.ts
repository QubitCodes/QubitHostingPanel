import type { ProviderResource } from '@services/hosting/HostingProvider';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';

const DEFAULT_STATUS_TTL_MS = 5_000;

/** Converts one provider inventory response into application UUID/status pairs. */
export function applicationStatusMap(
	resources: readonly ProviderResource[],
): ReadonlyMap<string, string> {
	return new Map(
		resources
			.filter(
				(resource): resource is ProviderResource & { status: string } =>
					resource.kind === 'application' &&
					typeof resource.status === 'string' &&
					resource.status.trim().length > 0,
			)
			.map((resource) => [resource.id, resource.status] as const),
	);
}

/**
 * Small process-local cache for provider status snapshots.
 *
 * One inventory call serves every card on the listing. A stale successful
 * snapshot remains usable during a temporary provider failure, while callers
 * without any snapshot can safely fall back to their persisted status.
 */
export class ApplicationProviderStatusCache {
	private expiresAt = 0;
	private inFlight?: Promise<ReadonlyMap<string, string>>;
	private snapshot?: ReadonlyMap<string, string>;

	public constructor(private readonly ttlMs = DEFAULT_STATUS_TTL_MS) {}

	public async get(
		load: () => Promise<readonly ProviderResource[]>,
		now = Date.now(),
	): Promise<ReadonlyMap<string, string>> {
		if (this.snapshot && now < this.expiresAt) return this.snapshot;
		if (this.inFlight) return this.inFlight;
		this.inFlight = load()
			.then((resources) => {
				this.snapshot = applicationStatusMap(resources);
				this.expiresAt = Date.now() + this.ttlMs;
				return this.snapshot;
			})
			.catch((error: unknown) => {
				if (this.snapshot) return this.snapshot;
				throw error;
			})
			.finally(() => {
				this.inFlight = undefined;
			});
		return this.inFlight;
	}
}

const providerStatusCache = new ApplicationProviderStatusCache();

/** Returns one cached, provider-authoritative status snapshot for application listings. */
export async function currentApplicationProviderStatuses(): Promise<
	ReadonlyMap<string, string>
> {
	return providerStatusCache.get(async () =>
		(await hostingProvider()).listResources(),
	);
}
