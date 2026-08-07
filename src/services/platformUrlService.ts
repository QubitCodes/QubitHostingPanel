import { eq, isNull, and } from 'drizzle-orm';

import { db } from '@db/client';
import { platformSettings } from '@db/schema';

export interface EffectivePlatformUrls { applicationBaseDomain: string; applicationDomainReady: boolean; blockedDomainKeywords: string[]; defaultApplicationSubdomainEnabled: boolean; panelBaseUrl: string; panelDomainMode: 'same_domain' | 'separate_domain'; panelDomainReady: boolean; publicBaseUrl: string; reservedDomainLabels: string[] }

/** Accepts either a hostname or URL and returns the hostname used for app subdomains. */
export function normalizeApplicationBaseDomain(
	value: string | undefined,
	fallbackHost: string,
): string {
	if (!value?.trim()) return fallbackHost;
	try {
		const parsed = new URL(
			/^[a-z][a-z\d+.-]*:\/\//i.test(value.trim())
				? value.trim()
				: `https://${value.trim()}`,
		);
		return parsed.hostname.replace(/^\*\./, '') || fallbackHost;
	} catch {
		return fallbackHost;
	}
}

/** Resolves verified platform URLs while retaining environment-backed safe defaults. */
export async function getEffectivePlatformUrls(): Promise<EffectivePlatformUrls> {
	const fallbackUrl = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	const fallbackHost = new URL(fallbackUrl).hostname;
	const [settings] = await db.select().from(platformSettings).where(and(eq(platformSettings.key, 'default'), isNull(platformSettings.deletedAt))).limit(1);
	if (!settings) return { applicationBaseDomain: normalizeApplicationBaseDomain(process.env.COOLIFY_WILDCARD_DOMAIN, fallbackHost), applicationDomainReady: true, blockedDomainKeywords: [], defaultApplicationSubdomainEnabled: true, panelBaseUrl: fallbackUrl, panelDomainMode: 'same_domain', panelDomainReady: true, publicBaseUrl: fallbackUrl, reservedDomainLabels: ['admin', 'api', 'dashboard', 'panel', 'www'] };
	const panelDomainReady = settings.panelDomainMode === 'same_domain' || settings.panelDomainStatus === 'verified';
	return { applicationBaseDomain: settings.applicationBaseDomain, applicationDomainReady: settings.applicationDomainStatus === 'verified', blockedDomainKeywords: settings.blockedDomainKeywords, defaultApplicationSubdomainEnabled: settings.defaultApplicationSubdomainEnabled, panelBaseUrl: panelDomainReady && settings.panelBaseUrl ? settings.panelBaseUrl : settings.publicBaseUrl, panelDomainMode: settings.panelDomainMode, panelDomainReady, publicBaseUrl: settings.publicBaseUrl, reservedDomainLabels: settings.reservedDomainLabels };
}

export async function platformUrl(path: string, target: 'panel' | 'public' = 'public'): Promise<string> {
	const urls = await getEffectivePlatformUrls();
	return new URL(path, target === 'panel' ? urls.panelBaseUrl : urls.publicBaseUrl).toString();
}
