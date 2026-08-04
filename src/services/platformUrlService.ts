import { eq, isNull, and } from 'drizzle-orm';

import { db } from '@db/client';
import { platformSettings } from '@db/schema';

export interface EffectivePlatformUrls { applicationBaseDomain: string; applicationDomainReady: boolean; defaultApplicationSubdomainEnabled: boolean; panelBaseUrl: string; panelDomainMode: 'same_domain' | 'separate_domain'; panelDomainReady: boolean; publicBaseUrl: string }

/** Resolves verified platform URLs while retaining environment-backed safe defaults. */
export async function getEffectivePlatformUrls(): Promise<EffectivePlatformUrls> {
	const fallbackUrl = (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	const fallbackHost = new URL(fallbackUrl).hostname;
	const [settings] = await db.select().from(platformSettings).where(and(eq(platformSettings.key, 'default'), isNull(platformSettings.deletedAt))).limit(1);
	if (!settings) return { applicationBaseDomain: process.env.COOLIFY_WILDCARD_DOMAIN ?? fallbackHost, applicationDomainReady: true, defaultApplicationSubdomainEnabled: true, panelBaseUrl: fallbackUrl, panelDomainMode: 'same_domain', panelDomainReady: true, publicBaseUrl: fallbackUrl };
	const panelDomainReady = settings.panelDomainMode === 'same_domain' || settings.panelDomainStatus === 'verified';
	return { applicationBaseDomain: settings.applicationBaseDomain, applicationDomainReady: settings.applicationDomainStatus === 'verified', defaultApplicationSubdomainEnabled: settings.defaultApplicationSubdomainEnabled, panelBaseUrl: panelDomainReady && settings.panelBaseUrl ? settings.panelBaseUrl : settings.publicBaseUrl, panelDomainMode: settings.panelDomainMode, panelDomainReady, publicBaseUrl: settings.publicBaseUrl };
}

export async function platformUrl(path: string, target: 'panel' | 'public' = 'public'): Promise<string> {
	const urls = await getEffectivePlatformUrls();
	return new URL(path, target === 'panel' ? urls.panelBaseUrl : urls.publicBaseUrl).toString();
}
