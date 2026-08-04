import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@db/client';
import { domainOwnerships, platformSettings } from '@db/schema';

/** Normalize a hostname before ownership and ancestry comparisons. */
export function normalizeHostname(hostname: string): string {
	return hostname.trim().toLowerCase().replace(/\.$/, '');
}

/** Find the most-specific verified ownership scope controlling a hostname. */
export async function controllingOwnership(hostname: string) {
	const normalized = normalizeHostname(hostname);
	const [ownership] = await db.select().from(domainOwnerships).where(and(
		eq(domainOwnerships.status, 'verified'),
		isNull(domainOwnerships.deletedAt),
		sql`(${normalized} = ${domainOwnerships.hostname} OR ${normalized} LIKE ('%.' || ${domainOwnerships.hostname}))`,
	)).orderBy(desc(sql`length(${domainOwnerships.hostname})`)).limit(1);
	return ownership;
}

/** Read whether new custom-domain claims require external DNS proof. */
export async function ownershipVerificationEnabled(): Promise<boolean> {
	const [settings] = await db.select({ enabled: platformSettings.domainOwnershipVerificationEnabled }).from(platformSettings).where(and(eq(platformSettings.key, 'default'), isNull(platformSettings.deletedAt))).limit(1);
	return settings?.enabled ?? true;
}

/** Create a first ownership claim, optionally trusting it when verification is disabled. */
export async function createOwnershipClaim(workspaceId: string, hostname: string) {
	const verificationRequired = await ownershipVerificationEnabled();
	const [ownership] = await db.insert(domainOwnerships).values({
		workspaceId,
		hostname: normalizeHostname(hostname),
		status: verificationRequired ? 'pending' : 'verified',
		verificationToken: verificationRequired ? randomUUID() : null,
		verificationMethod: verificationRequired ? 'dns_txt' : 'platform_bypass',
		verifiedAt: verificationRequired ? null : new Date(),
	}).returning();
	return ownership;
}
