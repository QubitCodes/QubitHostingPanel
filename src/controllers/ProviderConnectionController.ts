import { and, desc, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { providerConnections, providerConnectionTokens, providerImportedResources, providerReconciliationRuns } from '@db/schema';
import type { CreateProviderConnectionInput } from '@schemas/providerConnection';
import { recordAuditLog } from '@services/auditLogService';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import { createProviderConnection, managedCoolifyProvider, rotateProviderToken } from '@services/hosting/providerConnectionService';
import { reconcileProviderConnection } from '@services/hosting/providerReconciliationService';
import type { RequestMetadata } from '@utils/request';

export class ProviderConnectionController {
	public static async index(request: Request, metadata: RequestMetadata): Promise<Response> {
		try {
			await authorizeAdmin(request, 'provisioning.view', metadata);
			const connections = await db.select({ baseUrl: providerConnections.baseUrl, code: providerConnections.code, id: providerConnections.id, isDefault: providerConnections.isDefault, lastError: providerConnections.lastError, lastHealthyAt: providerConnections.lastHealthyAt, lastValidatedAt: providerConnections.lastValidatedAt, name: providerConnections.name, status: providerConnections.status, tokenSuffix: providerConnectionTokens.tokenSuffix, tokenVersion: providerConnectionTokens.version }).from(providerConnections).leftJoin(providerConnectionTokens, and(eq(providerConnectionTokens.connectionId, providerConnections.id), eq(providerConnectionTokens.status, 'active'), isNull(providerConnectionTokens.deletedAt))).where(isNull(providerConnections.deletedAt)).orderBy(desc(providerConnections.createdAt));
			const runs = await db.select().from(providerReconciliationRuns).where(isNull(providerReconciliationRuns.deletedAt)).orderBy(desc(providerReconciliationRuns.startedAt)).limit(20);
			const imports = await db.select({ connectionId: providerImportedResources.connectionId, kind: providerImportedResources.kind, matchedWorkspaceResourceId: providerImportedResources.matchedWorkspaceResourceId, missingSince: providerImportedResources.missingSince, name: providerImportedResources.name, providerResourceId: providerImportedResources.providerResourceId, status: providerImportedResources.status }).from(providerImportedResources).where(isNull(providerImportedResources.deletedAt)).orderBy(desc(providerImportedResources.lastObservedAt)).limit(500);
			return resp.success('Provider connections retrieved.', { connections, imports, runs });
		} catch { return resp.failure('Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); }
	}

	public static async create(request: Request, input: CreateProviderConnectionInput, metadata: RequestMetadata): Promise<Response> {
		try { const admin = await authorizeAdmin(request, 'provisioning.create', metadata); const id = await createProviderConnection(input, admin.userId); await recordAuditLog({ action: 'provider_connection.created', actorUserId: admin.userId, ipAddress: metadata.ipAddress, metadata: { code: input.code }, resourceId: id, resourceType: 'provider_connection', userAgent: metadata.userAgent }); return resp.success('Provider connection created and validated.', { id }, resp.codes.CREATED, undefined, 201); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Connection failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}

	public static async validate(request: Request, connectionId: string, metadata: RequestMetadata): Promise<Response> {
		try { await authorizeAdmin(request, 'provisioning.update', metadata); const result = await (await managedCoolifyProvider(connectionId)).validateConnection(); await db.update(providerConnections).set({ lastError: null, lastHealthyAt: new Date(), lastValidatedAt: new Date(), status: 'active', updatedAt: new Date() }).where(eq(providerConnections.id, connectionId)); return resp.success('Provider connection validated.', result); } catch (error) { await db.update(providerConnections).set({ lastError: error instanceof Error ? error.message : 'Validation failed.', lastValidatedAt: new Date(), status: 'unhealthy', updatedAt: new Date() }).where(eq(providerConnections.id, connectionId)); return resp.failure(error instanceof Error ? error.message : 'Validation failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}

	public static async rotate(request: Request, connectionId: string, apiToken: string, metadata: RequestMetadata): Promise<Response> {
		try { const admin = await authorizeAdmin(request, 'provisioning.update', metadata); const version = await rotateProviderToken(connectionId, apiToken, admin.userId); await recordAuditLog({ action: 'provider_connection.token_rotated', actorUserId: admin.userId, ipAddress: metadata.ipAddress, metadata: { version }, resourceId: connectionId, resourceType: 'provider_connection', userAgent: metadata.userAgent }); return resp.success('Provider token validated and rotated.', { version }, resp.codes.UPDATED); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Rotation failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}

	public static async reconcile(request: Request, connectionId: string, metadata: RequestMetadata): Promise<Response> {
		try { const admin = await authorizeAdmin(request, 'provisioning.update', metadata); const result = await reconcileProviderConnection(connectionId); await recordAuditLog({ action: 'provider_connection.reconciled', actorUserId: admin.userId, ipAddress: metadata.ipAddress, metadata: result, resourceId: connectionId, resourceType: 'provider_connection', userAgent: metadata.userAgent }); return resp.success('Provider reconciliation completed.', result); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Reconciliation failed.', resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502); }
	}
}
