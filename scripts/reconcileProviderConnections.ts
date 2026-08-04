import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@db/client';
import { providerConnections } from '@db/schema';
import { reconcileProviderConnection } from '@services/hosting/providerReconciliationService';

const connections = await db.select({ id: providerConnections.id }).from(providerConnections).where(and(eq(providerConnections.status, 'active'), isNull(providerConnections.deletedAt)));
for (const connection of connections) console.log(JSON.stringify(await reconcileProviderConnection(connection.id)));
process.exit(0);
