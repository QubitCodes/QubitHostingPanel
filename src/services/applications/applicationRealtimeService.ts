import { hostingProvider } from '@services/hosting/hostingProviderFactory';

export interface ApplicationRealtimeEvent {
	applicationId: string;
	deploymentId?: string;
	deploymentStatus?: string;
	logsAvailable?: boolean;
	providerStatus?: string;
	type: 'connected' | 'deployment' | 'status';
}

type Listener = (event: ApplicationRealtimeEvent) => void;

const listeners = new Map<string, Set<Listener>>();
const trackers = new Map<string, { cancelled: boolean; providerId: string }>();
const fingerprints = new Map<string, string>();

/** Broadcasts one application event to every authorized stream in this process. */
export function publishApplicationEvent(event: ApplicationRealtimeEvent): void {
	for (const listener of listeners.get(event.applicationId) ?? [])
		listener(event);
}

/** Starts one provider tracker per application, regardless of connected browser count. */
function startTracker(applicationId: string, providerId: string): void {
	if (trackers.has(applicationId)) return;
	const tracker = { cancelled: false, providerId };
	trackers.set(applicationId, tracker);
	const inspect = async (): Promise<void> => {
		if (tracker.cancelled) return;
		try {
			const provider = await hostingProvider();
			const [state, deployments] = await Promise.all([
				provider.getApplicationState(providerId),
				provider.listApplicationDeployments(providerId, 1),
			]);
			const latest = deployments[0];
			let logsAvailable = Boolean(latest?.logs);
			let logsLength = latest?.logs?.length ?? 0;
			if (latest?.id && !logsAvailable) {
				const detail = await provider.getApplicationDeployment(latest.id);
				logsAvailable = Boolean(detail.logs);
				logsLength = detail.logs?.length ?? 0;
			}
			const fingerprint = JSON.stringify([
				state.status,
				latest?.id,
				latest?.status,
				logsAvailable,
				logsLength,
			]);
			if (fingerprints.get(applicationId) !== fingerprint) {
				fingerprints.set(applicationId, fingerprint);
				publishApplicationEvent({
					applicationId,
					providerStatus: state.status,
					type: 'status',
				});
				if (latest)
					publishApplicationEvent({
						applicationId,
						deploymentId: latest.id,
						deploymentStatus: latest.status,
						logsAvailable,
						type: 'deployment',
					});
			}
		} catch {
			// A temporary provider failure must not terminate the authenticated stream.
		}
		const active = /queued|pending|building|starting|progress|deploying/i.test(
			`${fingerprints.get(applicationId) ?? ''}`,
		);
		if (!tracker.cancelled && active) setTimeout(() => void inspect(), 2_500);
		else if (!tracker.cancelled) trackers.delete(applicationId);
	};
	void inspect();
}

/** Restarts tracking after Ghost Deploy itself queues a deployment. */
export function ensureApplicationTracker(
	applicationId: string,
	providerId: string,
): void {
	if (listeners.get(applicationId)?.size)
		startTracker(applicationId, providerId);
}

/** Subscribes to one application and returns an idempotent cleanup callback. */
export function subscribeApplicationEvents(
	applicationId: string,
	providerId: string,
	listener: Listener,
): () => void {
	const applicationListeners =
		listeners.get(applicationId) ?? new Set<Listener>();
	applicationListeners.add(listener);
	listeners.set(applicationId, applicationListeners);
	startTracker(applicationId, providerId);
	listener({ applicationId, type: 'connected' });
	return () => {
		applicationListeners.delete(listener);
		if (applicationListeners.size) return;
		listeners.delete(applicationId);
		const tracker = trackers.get(applicationId);
		if (tracker) tracker.cancelled = true;
		trackers.delete(applicationId);
		fingerprints.delete(applicationId);
	};
}
