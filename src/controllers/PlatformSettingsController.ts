import { and, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { platformSettings } from '@db/schema';
import type { UpdatePlatformSettingsInput, VerifyPlatformDomainInput } from '@schemas/platformSettings';
import { recordAuditLog } from '@services/auditLogService';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import { getEffectivePlatformUrls } from '@services/platformUrlService';
import { verifyPlatformHostname } from '@services/platformDomainVerificationService';
import type { RequestMetadata } from '@utils/request';

export class PlatformSettingsController {
	public static async publicConfiguration(): Promise<Response> { return resp.success('Public platform configuration retrieved.', await getEffectivePlatformUrls()); }

	public static async show(request: Request, metadata: RequestMetadata): Promise<Response> {
		try {
			await authorizeAdmin(request, 'platform_settings.view', metadata);
			const [settings] = await db.select().from(platformSettings).where(and(eq(platformSettings.key, 'default'), isNull(platformSettings.deletedAt))).limit(1);
			return resp.success('Platform settings retrieved.', settings ?? null);
		} catch { return resp.failure('Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); }
	}

	public static async update(request: Request, input: UpdatePlatformSettingsInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const admin = await authorizeAdmin(request, 'platform_settings.update', metadata);
			const [existing] = await db.select().from(platformSettings).where(and(eq(platformSettings.key, 'default'), isNull(platformSettings.deletedAt))).limit(1);
			const panelUnchanged = existing?.panelDomainMode === input.panelDomainMode && existing.panelBaseUrl === input.panelBaseUrl;
			const applicationDomainUnchanged = existing?.applicationBaseDomain === input.applicationBaseDomain;
			const values = { ...input, ingressIpv4: input.ingressIpv4 || null, ingressIpv6: input.ingressIpv6 || null, panelDomainStatus: input.panelDomainMode === 'same_domain' ? 'verified' as const : panelUnchanged ? existing.panelDomainStatus : 'pending' as const, applicationDomainStatus: applicationDomainUnchanged ? existing.applicationDomainStatus : 'pending' as const, updatedAt: new Date() };
			const [settings] = existing ? await db.update(platformSettings).set(values).where(eq(platformSettings.id, existing.id)).returning() : await db.insert(platformSettings).values({ ...values, key: 'default' }).returning();
			await recordAuditLog({ action: 'platform_settings.updated', actorUserId: admin.userId, ipAddress: metadata.ipAddress, metadata: { changedFields: Object.keys(input), panelDomainMode: input.panelDomainMode }, resourceId: settings?.id, resourceType: 'platform_settings', userAgent: metadata.userAgent });
			return resp.success('Platform settings saved. New domains remain pending until DNS and TLS verification completes.', settings, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to save platform settings.', resp.codes.GENERAL_SERVER_ERROR, undefined, null, undefined, 500); }
	}

	public static async verify(request: Request, input: VerifyPlatformDomainInput, metadata: RequestMetadata): Promise<Response> {
		try {
			const admin = await authorizeAdmin(request, 'platform_settings.update', metadata);
			const [settings] = await db.select().from(platformSettings).where(and(eq(platformSettings.key, 'default'), isNull(platformSettings.deletedAt))).limit(1);
			if (!settings) return resp.failure('Save platform settings before verification.', resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			const value = input.target === 'panel' ? settings.panelBaseUrl : settings.applicationBaseDomain;
			if (!value) return resp.failure('The selected domain is not configured.', resp.codes.MISSING_REQUIRED_FIELD, undefined, null, undefined, 400);
			const result = await verifyPlatformHostname(input.target, value);
			await db.update(platformSettings).set(input.target === 'panel' ? { panelDomainStatus: 'verified', updatedAt: new Date() } : { applicationDomainStatus: 'verified', updatedAt: new Date() }).where(eq(platformSettings.id, settings.id));
			await recordAuditLog({ action: 'platform_domain.verified', actorUserId: admin.userId, ipAddress: metadata.ipAddress, metadata: { ...result, target: input.target }, resourceId: settings.id, resourceType: 'platform_settings', userAgent: metadata.userAgent });
			return resp.success('DNS and HTTPS verification passed.', result, resp.codes.UPDATED);
		} catch (error) { return resp.failure(error instanceof Error ? error.message : 'Domain verification failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}
}
