import { and, eq, isNull } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { db } from '@db/client';
import { applicationBuilds, customers, users, workspaceGithubConnections, workspaceMemberships, workspaces } from '@db/schema';
import type { z } from 'zod';
import type { adminApplicationFileReadSchema } from '@schemas/adminCustomerControl';
import { recordRequiredAdminAuditLog } from '@services/auditLogService';
import { authorizeAdmin } from '@services/authorization/adminAuthorizationService';
import { githubRepositoryFile, githubRepositoryTree } from '@services/github/githubAppService';
import type { RequestMetadata } from '@utils/request';

type FileReadInput = z.infer<typeof adminApplicationFileReadSchema>;
const SENSITIVE_FILE = /(^|\/)(?:\.env(?:\..*)?|\.npmrc|\.pypirc|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?\.(?:json|ya?ml))$/i;

function repository(value: string): { owner: string; repository: string } { const url = new URL(value); const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean); if (url.hostname !== 'github.com' || parts.length !== 2) throw new Error('Source file browsing currently supports GitHub repositories.'); return { owner: parts[0]!, repository: parts[1]! }; }
async function ownedSource(userPublicId: number, workspacePublicId: number, applicationId: string) {
	const [record] = await db.select({ id: applicationBuilds.id, branch: applicationBuilds.sourceRef, sourceRepository: applicationBuilds.sourceRepository, workspaceId: workspaces.id, githubInstallationId: workspaceGithubConnections.installationId }).from(applicationBuilds).innerJoin(workspaces, and(eq(workspaces.id, applicationBuilds.workspaceId), eq(workspaces.publicId, workspacePublicId), isNull(workspaces.deletedAt))).innerJoin(workspaceMemberships, and(eq(workspaceMemberships.workspaceId, workspaces.id), isNull(workspaceMemberships.deletedAt))).innerJoin(customers, and(eq(customers.id, workspaceMemberships.customerId), isNull(customers.deletedAt))).innerJoin(users, and(eq(users.id, customers.userId), eq(users.publicId, userPublicId), isNull(users.deletedAt))).leftJoin(workspaceGithubConnections, and(eq(workspaceGithubConnections.workspaceId, workspaces.id), eq(workspaceGithubConnections.status, 'active'), isNull(workspaceGithubConnections.deletedAt))).where(and(eq(applicationBuilds.id, applicationId), isNull(applicationBuilds.deletedAt))).limit(1);
	if (!record) throw new Error('Application not found.'); return record;
}

export class AdminApplicationFileController {
	public static async index(request: Request, userPublicId: number, workspacePublicId: number, applicationId: string, metadata: RequestMetadata): Promise<Response> {
		try { const actor = await authorizeAdmin(request, 'application_files.view', metadata); const source = await ownedSource(userPublicId, workspacePublicId, applicationId); const parsed = repository(source.sourceRepository); const rows = await githubRepositoryTree({ ...parsed, branch: source.branch, installationId: source.githubInstallationId ?? undefined }); await recordRequiredAdminAuditLog({ actorUserId: actor.userId, action: 'admin.application_files.view', resourceType: 'application_build', resourceId: source.id, metadata: { permission: 'application_files.view', userPublicId, workspacePublicId, resultCount: rows.length, repository: source.sourceRepository, branch: source.branch }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Application source files retrieved.', { branch: source.branch, repository: source.sourceRepository, files: rows }); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Permission denied.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); }
	}

	public static async read(request: Request, userPublicId: number, workspacePublicId: number, applicationId: string, input: FileReadInput, metadata: RequestMetadata): Promise<Response> {
		try { const sensitive = SENSITIVE_FILE.test(input.path); const permission = sensitive ? 'application_files.reveal_sensitive' : 'application_files.read'; const actor = await authorizeAdmin(request, permission, metadata); if (sensitive && !input.reason) return resp.failure('A reason is required to view a sensitive file.', resp.codes.VALIDATION_ERROR, [{ field: 'reason', message: 'Reason is required.' }], null, undefined, 400); const source = await ownedSource(userPublicId, workspacePublicId, applicationId); const parsed = repository(source.sourceRepository); const file = await githubRepositoryFile({ ...parsed, branch: source.branch, installationId: source.githubInstallationId ?? undefined, path: input.path }); await recordRequiredAdminAuditLog({ actorUserId: actor.userId, action: `admin.${permission}`, resourceType: 'application_build', resourceId: source.id, reason: input.reason, metadata: { permission, userPublicId, workspacePublicId, path: input.path, size: file.size, sensitive }, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent }); return resp.success('Application source file retrieved.', { ...file, path: input.path, sensitive }); } catch (error) { return resp.failure(error instanceof Error ? error.message : 'Unable to read source file.', resp.codes.PERMISSION_DENIED, undefined, null, undefined, 403); }
	}
}
