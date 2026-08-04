import { createHash } from 'node:crypto';
import { and, eq, isNull, notInArray } from 'drizzle-orm';

import { db } from '@db/client';
import { providerConnections, providerImportedResources, providerReconciliationRuns, workspaceResources } from '@db/schema';
import type { CoolifyImportKind } from '@services/hosting/CoolifyHostingProvider';
import { managedCoolifyProvider } from '@services/hosting/providerConnectionService';

const IMPORT_KINDS: CoolifyImportKind[] = ['server', 'application', 'database', 'service', 'deployment'];
const SECRET_KEY = /password|token|secret|private.?key|credential/i;

/** Removes credential-like properties recursively before provider payloads reach persistence. */
export function sanitizeProviderSnapshot(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sanitizeProviderSnapshot);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !SECRET_KEY.test(key)).map(([key, child]) => [key, sanitizeProviderSnapshot(child)]));
}

function identity(item: Record<string, unknown>): string | undefined { return [item.uuid, item.id, item.deployment_uuid].find((value) => typeof value === 'string' || typeof value === 'number')?.toString(); }

/** Reconciles provider inventory without creating workspaces, subscriptions, or ownership. */
export async function reconcileProviderConnection(connectionId: string): Promise<{ failures: Array<{ kind: string; message: string }>; importedCounts: Record<string, number>; runId: string }> {
	const [connection] = await db.select({ id: providerConnections.id }).from(providerConnections).where(and(eq(providerConnections.id, connectionId), isNull(providerConnections.deletedAt))).limit(1);
	if (!connection) throw new Error('Provider connection not found.');
	const [run] = await db.insert(providerReconciliationRuns).values({ connectionId }).returning({ id: providerReconciliationRuns.id });
	const provider = await managedCoolifyProvider(connectionId);
	const importedCounts: Record<string, number> = {};
	const failures: Array<{ kind: string; message: string }> = [];
	for (const kind of IMPORT_KINDS) {
		try {
			const items = await provider.listImportResources(kind);
			const observedIds: string[] = [];
			for (const item of items) {
				const providerResourceId = identity(item);
				if (!providerResourceId) continue;
				observedIds.push(providerResourceId);
				const snapshot = sanitizeProviderSnapshot(item) as Record<string, unknown>;
				const payloadHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
				const [matched] = await db.select({ id: workspaceResources.id }).from(workspaceResources).where(and(eq(workspaceResources.providerResourceId, providerResourceId), isNull(workspaceResources.deletedAt))).limit(1);
				await db.insert(providerImportedResources).values({ connectionId, kind, matchedWorkspaceResourceId: matched?.id, name: String(item.name ?? item.fqdn ?? providerResourceId), payloadHash, providerResourceId, snapshot, status: typeof item.status === 'string' ? item.status : null }).onConflictDoUpdate({ target: [providerImportedResources.connectionId, providerImportedResources.kind, providerImportedResources.providerResourceId], targetWhere: isNull(providerImportedResources.deletedAt), set: { lastObservedAt: new Date(), matchedWorkspaceResourceId: matched?.id ?? null, missingSince: null, name: String(item.name ?? item.fqdn ?? providerResourceId), payloadHash, snapshot, status: typeof item.status === 'string' ? item.status : null, updatedAt: new Date() } });
			}
			const baseMissing = [eq(providerImportedResources.connectionId, connectionId), eq(providerImportedResources.kind, kind), isNull(providerImportedResources.deletedAt), isNull(providerImportedResources.missingSince)];
			await db.update(providerImportedResources).set({ missingSince: new Date(), updatedAt: new Date() }).where(observedIds.length ? and(...baseMissing, notInArray(providerImportedResources.providerResourceId, observedIds)) : and(...baseMissing));
			importedCounts[kind] = observedIds.length;
		} catch (error) { failures.push({ kind, message: error instanceof Error ? error.message : 'Import failed.' }); }
	}
	const status = failures.length === 0 ? 'succeeded' : failures.length === IMPORT_KINDS.length ? 'failed' : 'partial';
	await db.update(providerReconciliationRuns).set({ completedAt: new Date(), failureDetails: failures, importedCounts, status, updatedAt: new Date() }).where(eq(providerReconciliationRuns.id, run.id));
	await db.update(providerConnections).set({ lastError: failures.length ? failures.map((failure) => `${failure.kind}: ${failure.message}`).join('; ').slice(0, 2000) : null, lastHealthyAt: failures.length === 0 ? new Date() : undefined, lastValidatedAt: new Date(), status: failures.length === IMPORT_KINDS.length ? 'unhealthy' : 'active', updatedAt: new Date() }).where(eq(providerConnections.id, connectionId));
	return { failures, importedCounts, runId: run.id };
}
