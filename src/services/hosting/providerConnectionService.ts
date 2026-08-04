import { createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { providerConnections, providerConnectionTokens } from '@db/schema';
import { decryptCredential, encryptCredential } from '@services/encryption/credentialEncryptionService';
import { CoolifyHostingProvider } from '@services/hosting/CoolifyHostingProvider';

export interface SaveProviderConnectionInput { apiToken: string; baseUrl: string; code: string; defaultEnvironmentName?: string; defaultProjectUuid?: string; destinationUuid?: string; isDefault?: boolean; name: string; serverUuid?: string; teamId?: number; wildcardDomain?: string }

function fingerprint(token: string): string { return createHash('sha256').update(token).digest('hex'); }

/** Resolves an active database-managed connection, falling back to the bootstrap environment. */
export async function managedCoolifyProvider(connectionId?: string): Promise<CoolifyHostingProvider> {
	const conditions = [isNull(providerConnections.deletedAt), eq(providerConnections.status, 'active')];
	if (connectionId) conditions.push(eq(providerConnections.id, connectionId)); else conditions.push(eq(providerConnections.isDefault, true));
	const [row] = await db.select({ connection: providerConnections, token: providerConnectionTokens.tokenCiphertext }).from(providerConnections).innerJoin(providerConnectionTokens, and(eq(providerConnectionTokens.connectionId, providerConnections.id), eq(providerConnectionTokens.status, 'active'), isNull(providerConnectionTokens.deletedAt))).where(and(...conditions)).limit(1);
	if (!row) return new CoolifyHostingProvider();
	return new CoolifyHostingProvider({ apiToken: decryptCredential(row.token), baseUrl: row.connection.baseUrl, defaultEnvironmentName: row.connection.defaultEnvironmentName, defaultProjectUuid: row.connection.defaultProjectUuid, destinationUuid: row.connection.destinationUuid, serverUuid: row.connection.serverUuid, wildcardDomain: row.connection.wildcardDomain });
}

/** Creates a validated connection and stores only authenticated encrypted token material. */
export async function createProviderConnection(input: SaveProviderConnectionInput, createdByUserId?: string): Promise<string> {
	const provider = new CoolifyHostingProvider(input);
	await provider.validateConnection();
	return db.transaction(async (transaction) => {
		if (input.isDefault) await transaction.update(providerConnections).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(providerConnections.provider, 'coolify'), isNull(providerConnections.deletedAt)));
		const [connection] = await transaction.insert(providerConnections).values({ ...input, createdByUserId: createdByUserId ?? null, isDefault: input.isDefault ?? false, lastHealthyAt: new Date(), lastValidatedAt: new Date() }).returning({ id: providerConnections.id });
		await transaction.insert(providerConnectionTokens).values({ connectionId: connection.id, createdByUserId: createdByUserId ?? null, tokenCiphertext: encryptCredential(input.apiToken), tokenFingerprint: fingerprint(input.apiToken), tokenSuffix: input.apiToken.slice(-8), version: 1 });
		return connection.id;
	});
}

/** Validates a candidate token before atomically activating it and retiring its predecessor. */
export async function rotateProviderToken(connectionId: string, apiToken: string, createdByUserId?: string): Promise<number> {
	const [connection] = await db.select().from(providerConnections).where(and(eq(providerConnections.id, connectionId), isNull(providerConnections.deletedAt))).limit(1);
	if (!connection) throw new Error('Provider connection not found.');
	await new CoolifyHostingProvider({ ...connection, apiToken }).validateConnection();
	return db.transaction(async (transaction) => {
		const [latest] = await transaction.select({ version: providerConnectionTokens.version }).from(providerConnectionTokens).where(and(eq(providerConnectionTokens.connectionId, connectionId), isNull(providerConnectionTokens.deletedAt))).orderBy(desc(providerConnectionTokens.version)).limit(1);
		const version = (latest?.version ?? 0) + 1;
		await transaction.update(providerConnectionTokens).set({ retiredAt: new Date(), status: 'retired', updatedAt: new Date() }).where(and(eq(providerConnectionTokens.connectionId, connectionId), eq(providerConnectionTokens.status, 'active'), isNull(providerConnectionTokens.deletedAt)));
		await transaction.insert(providerConnectionTokens).values({ connectionId, createdByUserId: createdByUserId ?? null, tokenCiphertext: encryptCredential(apiToken), tokenFingerprint: fingerprint(apiToken), tokenSuffix: apiToken.slice(-8), version });
		await transaction.update(providerConnections).set({ lastError: null, lastHealthyAt: new Date(), lastValidatedAt: new Date(), status: 'active', updatedAt: new Date() }).where(eq(providerConnections.id, connectionId));
		return version;
	});
}

/** Imports the currently configured environment connection once, for migration-safe rollout. */
export async function bootstrapEnvironmentProviderConnection(): Promise<string> {
	const environment = getEnvironment();
	if (!environment.COOLIFY_BASE_URL || !environment.COOLIFY_API_TOKEN) throw new Error('Coolify environment credentials are unavailable.');
	const [existing] = await db.select({ id: providerConnections.id }).from(providerConnections).where(and(eq(providerConnections.code, 'coolify-primary'), isNull(providerConnections.deletedAt))).limit(1);
	if (existing) return existing.id;
	return createProviderConnection({ apiToken: environment.COOLIFY_API_TOKEN, baseUrl: environment.COOLIFY_BASE_URL, code: 'coolify-primary', defaultEnvironmentName: environment.COOLIFY_DEFAULT_ENVIRONMENT_NAME, defaultProjectUuid: environment.COOLIFY_DEFAULT_PROJECT_UUID, destinationUuid: environment.COOLIFY_DESTINATION_UUID, isDefault: true, name: 'Primary Coolify', serverUuid: environment.COOLIFY_SERVER_UUID, wildcardDomain: environment.COOLIFY_WILDCARD_DOMAIN });
}
