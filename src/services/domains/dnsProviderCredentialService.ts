import { and, eq, isNull } from 'drizzle-orm';

import { getEnvironment } from '@config/env';
import { db } from '@db/client';
import { dnsProviderConnections } from '@db/schema';
import type { DnsProviderCode } from '@schemas/dnsProvider';
import { decryptCredential, encryptCredential } from '@services/encryption/credentialEncryptionService';

export interface DnsProviderCredential { accountIdentifier?: string; token: string }

/** Resolves database-managed credentials first, retaining environment fallback for recovery. */
export async function dnsProviderCredential(provider: DnsProviderCode, includeUnhealthy = false): Promise<DnsProviderCredential | undefined> {
	const [connection] = await db.select().from(dnsProviderConnections).where(and(eq(dnsProviderConnections.provider, provider), ...(includeUnhealthy ? [] : [eq(dnsProviderConnections.status, 'active')]), isNull(dnsProviderConnections.deletedAt))).limit(1);
	if (connection) return { token: decryptCredential(connection.tokenCiphertext), ...(connection.accountIdentifier ? { accountIdentifier: connection.accountIdentifier } : {}) };
	if (provider === 'cloudflare') { const environment = getEnvironment(); if (environment.CLOUDFLARE_DNS_API_TOKEN) return { token: environment.CLOUDFLARE_DNS_API_TOKEN, ...(environment.CLOUDFLARE_DNS_ACCOUNT_ID ? { accountIdentifier: environment.CLOUDFLARE_DNS_ACCOUNT_ID } : {}) }; }
	if (provider === 'powerdns') { const environment = getEnvironment(); if (environment.POWERDNS_API_KEY) return { token: environment.POWERDNS_API_KEY, ...(environment.POWERDNS_API_URL ? { accountIdentifier: environment.POWERDNS_API_URL } : {}) }; }
	return undefined;
}

export async function saveDnsProviderCredential(provider: DnsProviderCode, input: { accountIdentifier?: string | null; token?: string }, userId: string): Promise<void> {
	const [existing] = await db.select().from(dnsProviderConnections).where(and(eq(dnsProviderConnections.provider, provider), isNull(dnsProviderConnections.deletedAt))).limit(1);
	if (!existing && !input.token) throw new Error('A token is required for a new provider connection.');
	if (provider === 'cloudflare' && !(input.accountIdentifier ?? existing?.accountIdentifier)) throw new Error('Cloudflare account ID is required.');
	if (provider === 'powerdns' && !(input.accountIdentifier ?? existing?.accountIdentifier)) throw new Error('PowerDNS API URL is required.');
	const values = { accountIdentifier: input.accountIdentifier ?? existing?.accountIdentifier ?? null, ...(input.token ? { tokenCiphertext: encryptCredential(input.token), tokenSuffix: input.token.slice(-8) } : {}), status: 'active', lastError: null, updatedByUserId: userId, updatedAt: new Date() } as const;
	if (existing) await db.update(dnsProviderConnections).set(values).where(eq(dnsProviderConnections.id, existing.id));
	else await db.insert(dnsProviderConnections).values({ provider, accountIdentifier: values.accountIdentifier, tokenCiphertext: encryptCredential(input.token!), tokenSuffix: input.token!.slice(-8), createdByUserId: userId, updatedByUserId: userId });
}

/** Performs a bounded provider-owned read without returning account data. */
export async function validateDnsProviderCredential(provider: DnsProviderCode): Promise<void> {
	const credential = await dnsProviderCredential(provider, true); if (!credential) throw new Error(`${provider} credentials are not configured.`);
	const url = provider === 'cloudflare' ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(credential.accountIdentifier ?? '')}` : provider === 'powerdns' ? `${credential.accountIdentifier?.replace(/\/$/, '')}/api/v1/servers/localhost` : provider === 'godaddy' ? 'https://api.godaddy.com/v1/domains?limit=1' : 'https://developers.hostinger.com/api/domains/v1/portfolio?page=1';
	const response = await fetch(url, { headers: { accept: 'application/json', ...(provider === 'powerdns' ? { 'x-api-key': credential.token } : { authorization: `Bearer ${credential.token}` }) }, signal: AbortSignal.timeout(15_000) });
	if (!response.ok) throw new Error(`${provider} credential validation returned HTTP ${response.status}.`);
}
