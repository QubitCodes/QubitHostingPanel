import { and, desc, eq, isNull } from 'drizzle-orm';
import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { providerConnections, providerConnectionTokens, providerImportedResources, providerReconciliationRuns } from '@db/schema';
import { rotateProviderToken } from '@services/hosting/providerConnectionService';

const environment = getEnvironment();
const [connection] = await db.select({ id: providerConnections.id }).from(providerConnections).where(and(eq(providerConnections.code, 'coolify-primary'), isNull(providerConnections.deletedAt))).limit(1);
if (!connection || !environment.COOLIFY_API_TOKEN) throw new Error('Bootstrapped provider connection or environment token missing.');
let [activeToken] = await db.select().from(providerConnectionTokens).where(and(eq(providerConnectionTokens.connectionId, connection.id), eq(providerConnectionTokens.status, 'active'), isNull(providerConnectionTokens.deletedAt))).limit(1);
if (activeToken.version === 1) { await rotateProviderToken(connection.id, environment.COOLIFY_API_TOKEN); [activeToken] = await db.select().from(providerConnectionTokens).where(and(eq(providerConnectionTokens.connectionId, connection.id), eq(providerConnectionTokens.status, 'active'), isNull(providerConnectionTokens.deletedAt))).limit(1); }
const [retired] = await db.select().from(providerConnectionTokens).where(and(eq(providerConnectionTokens.connectionId, connection.id), eq(providerConnectionTokens.status, 'retired'), isNull(providerConnectionTokens.deletedAt))).orderBy(desc(providerConnectionTokens.version)).limit(1);
const imports = await db.select({ kind: providerImportedResources.kind, matched: providerImportedResources.matchedWorkspaceResourceId }).from(providerImportedResources).where(and(eq(providerImportedResources.connectionId, connection.id), isNull(providerImportedResources.deletedAt)));
const [run] = await db.select().from(providerReconciliationRuns).where(and(eq(providerReconciliationRuns.connectionId, connection.id), eq(providerReconciliationRuns.status, 'succeeded'), isNull(providerReconciliationRuns.deletedAt))).orderBy(desc(providerReconciliationRuns.startedAt)).limit(1);
console.log(JSON.stringify({ activeTokenEncrypted: !activeToken.tokenCiphertext.includes(environment.COOLIFY_API_TOKEN), activeVersion: activeToken.version, imported: imports.length, matched: imports.filter((item) => item.matched).length, retiredVersion: retired?.version ?? null, successfulRun: Boolean(run) }));
process.exit(0);
