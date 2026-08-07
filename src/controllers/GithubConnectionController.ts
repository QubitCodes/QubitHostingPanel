import { and, eq, isNull } from "drizzle-orm";
import { resp } from "@qubitcodes/qcresp";

import { db } from "@db/client";
import { workspaceGithubConnections } from "@db/schema";
import { applicationWorkspaceAccess } from "@controllers/ApplicationController";
import {
  githubInstallation,
  githubInstallationRepositories,
  githubInstallationReviewUrl,
  githubInstallationUrl,
  GithubApiError,
  createGithubInstallationState,
  verifyGithubInstallationState,
} from "@services/github/githubAppService";
import { recordAuditLog } from "@services/auditLogService";
import { syncCoolifyGithubSource } from "@services/github/coolifyGithubSourceService";
import type { RequestMetadata } from "@utils/request";
import type { DeactivateGithubConnectionInput } from "@schemas/githubConnection";

const publicFields = {
  id: workspaceGithubConnections.id,
  accountLogin: workspaceGithubConnections.accountLogin,
  accountName: workspaceGithubConnections.accountName,
  accountType: workspaceGithubConnections.accountType,
  avatarUrl: workspaceGithubConnections.avatarUrl,
  installationId: workspaceGithubConnections.installationId,
  status: workspaceGithubConnections.status,
  providerSyncStatus: workspaceGithubConnections.providerSyncStatus,
  providerSyncError: workspaceGithubConnections.providerSyncError,
  updatedAt: workspaceGithubConnections.updatedAt,
};

/** Restricts reconciled installation rows to the same public contract as the list endpoint. */
function publicFieldsFromRow(row: typeof workspaceGithubConnections.$inferSelect) {
	return {
		id: row.id,
		accountLogin: row.accountLogin,
		accountName: row.accountName,
		accountType: row.accountType,
		avatarUrl: row.avatarUrl,
		installationId: row.installationId,
		status: row.status,
		providerSyncStatus: row.providerSyncStatus,
		providerSyncError: row.providerSyncError,
		updatedAt: row.updatedAt,
	};
}

export class GithubConnectionController {
	/** Reconciles workspace installations against GitHub after permission or installation changes. */
	public static async reconcile(
		request: Request,
		workspacePublicId: number,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await applicationWorkspaceAccess(request, workspacePublicId, metadata);
			const connections = await db.select().from(workspaceGithubConnections).where(and(
				eq(workspaceGithubConnections.workspaceId, workspace.id),
				eq(workspaceGithubConnections.status, "active"),
				isNull(workspaceGithubConnections.deletedAt),
			));
			const active: Array<typeof workspaceGithubConnections.$inferSelect> = [];
			const removedConnectionIds: string[] = [];
			for (const connection of connections) {
				try {
					const installation = await githubInstallation(connection.installationId);
					const values = {
						accountLogin: installation.account.login,
						accountName: installation.account.name ?? installation.account.login,
						accountType: installation.account.type,
						avatarUrl: installation.account.avatar_url ?? null,
						updatedAt: new Date(),
					};
					await db.update(workspaceGithubConnections).set(values).where(eq(workspaceGithubConnections.id, connection.id));
					active.push({ ...connection, ...values });
				} catch (error) {
					if (!(error instanceof GithubApiError) || error.status !== 404) throw error;
					await db.update(workspaceGithubConnections).set({ status: "inactive", providerSyncStatus: "inactive", providerSyncError: "GitHub installation was removed.", updatedAt: new Date() }).where(eq(workspaceGithubConnections.id, connection.id));
					removedConnectionIds.push(connection.id);
				}
			}
			await recordAuditLog({
				action: "github_connection.access_reconciled",
				actorUserId: workspace.actorUserId,
				resourceType: "workspace",
				resourceId: workspace.id,
				metadata: { workspacePublicId, activeConnectionIds: active.map(({ id }) => id), removedConnectionIds },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success("GitHub access refreshed.", active.map((row) => ({
				...publicFieldsFromRow(row),
				reviewUrl: githubInstallationReviewUrl({ accountLogin: row.accountLogin, accountType: row.accountType, installationId: row.installationId }),
			})), resp.codes.UPDATED);
		} catch (error) {
			return resp.failure(error instanceof Error ? error.message : "Unable to refresh GitHub access.", resp.codes.EXTERNAL_SERVICE_ERROR, undefined, null, undefined, 502);
		}
	}
	public static async deactivate(
		request: Request,
		workspacePublicId: number,
		connectionId: string,
		_input: DeactivateGithubConnectionInput,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await applicationWorkspaceAccess(request, workspacePublicId, metadata);
			const [connection] = await db
				.update(workspaceGithubConnections)
				.set({ status: "inactive", providerSyncStatus: "inactive", updatedAt: new Date() })
				.where(and(
					eq(workspaceGithubConnections.id, connectionId),
					eq(workspaceGithubConnections.workspaceId, workspace.id),
					eq(workspaceGithubConnections.status, "active"),
					isNull(workspaceGithubConnections.deletedAt),
				))
				.returning({ id: workspaceGithubConnections.id, accountLogin: workspaceGithubConnections.accountLogin });
			if (!connection) return resp.failure("GitHub connection not found.", resp.codes.RESOURCE_NOT_FOUND, undefined, null, undefined, 404);
			await recordAuditLog({
				action: "github_connection.deactivated",
				actorUserId: workspace.actorUserId,
				resourceType: "workspace_github_connection",
				resourceId: connection.id,
				metadata: { workspacePublicId, accountLogin: connection.accountLogin },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success("GitHub connection deactivated.", { id: connection.id }, resp.codes.UPDATED);
		} catch (error) {
			return resp.failure(error instanceof Error ? error.message : "Unable to deactivate GitHub connection.", resp.codes.GENERAL_BUSINESS_LOGIC_ERROR, undefined, null, undefined, 422);
		}
	}

  public static async index(
    request: Request,
    workspacePublicId: number,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const workspace = await applicationWorkspaceAccess(
        request,
        workspacePublicId,
        metadata,
      );
      const rows = await db
        .select(publicFields)
        .from(workspaceGithubConnections)
        .where(
          and(
            eq(workspaceGithubConnections.workspaceId, workspace.id),
            eq(workspaceGithubConnections.status, "active"),
            isNull(workspaceGithubConnections.deletedAt),
          ),
        );
      return resp.success(
        "GitHub connections retrieved.",
        rows.map((row) => ({
          ...row,
          reviewUrl: githubInstallationReviewUrl({
            accountLogin: row.accountLogin,
            accountType: row.accountType,
            installationId: row.installationId,
          }),
        })),
      );
    } catch {
      return resp.failure(
        "Workspace not found.",
        resp.codes.RESOURCE_NOT_FOUND,
        undefined,
        null,
        undefined,
        404,
      );
    }
  }
  public static async connect(
    request: Request,
    workspacePublicId: number,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const workspace = await applicationWorkspaceAccess(
        request,
        workspacePublicId,
        metadata,
      );
      const state = await createGithubInstallationState({
        actorUserId: workspace.actorUserId,
        workspaceId: workspace.id,
        workspacePublicId,
      });
      return resp.success("GitHub installation URL created.", {
        url: githubInstallationUrl(state),
      });
    } catch (error) {
      return resp.failure(
        error instanceof Error
          ? error.message
          : "GitHub connection is unavailable.",
        resp.codes.GENERAL_BUSINESS_LOGIC_ERROR,
        undefined,
        null,
        undefined,
        422,
      );
    }
  }
  public static async callback(url: URL): Promise<Response> {
    try {
      const installationId = url.searchParams.get("installation_id");
      const state = url.searchParams.get("state");
      if (!installationId || !state)
        throw new Error("GitHub installation callback is incomplete.");
      const context = await verifyGithubInstallationState(state);
      const installation = await githubInstallation(installationId);
      const [conflict] = await db
        .select({ workspaceId: workspaceGithubConnections.workspaceId })
        .from(workspaceGithubConnections)
        .where(
          and(
            eq(workspaceGithubConnections.installationId, installationId),
            isNull(workspaceGithubConnections.deletedAt),
          ),
        )
        .limit(1);
      if (conflict && conflict.workspaceId !== context.workspaceId)
        throw new Error(
          "This GitHub installation is already connected to another workspace.",
        );
      const [existing] = await db
        .select({ id: workspaceGithubConnections.id, status: workspaceGithubConnections.status })
        .from(workspaceGithubConnections)
        .where(
          and(
            eq(workspaceGithubConnections.installationId, installationId),
            eq(workspaceGithubConnections.workspaceId, context.workspaceId),
            isNull(workspaceGithubConnections.deletedAt),
          ),
        )
        .limit(1);
      const values = {
        accountLogin: installation.account.login,
        accountName: installation.account.name ?? installation.account.login,
        accountType: installation.account.type,
        avatarUrl: installation.account.avatar_url ?? null,
        providerSyncStatus: "pending",
        providerSyncError: null,
        status: "active",
        updatedAt: new Date(),
      };
      const connection = existing
        ? await db
            .update(workspaceGithubConnections)
            .set(values)
            .where(eq(workspaceGithubConnections.id, existing.id))
            .returning({ id: workspaceGithubConnections.id })
        : await db
            .insert(workspaceGithubConnections)
            .values({
              ...values,
              installationId,
              workspaceId: context.workspaceId,
              createdByUserId: context.actorUserId,
            })
            .returning({ id: workspaceGithubConnections.id });
      const connectionId = connection[0]?.id;
      if (!connectionId)
        throw new Error("Unable to persist GitHub connection.");
      let providerSyncStatus = "ready";
      try {
        const sourceUuid = await syncCoolifyGithubSource({
          accountLogin: installation.account.login,
          accountType: installation.account.type,
          installationId,
          workspacePublicId: context.workspacePublicId,
        });
        await db
          .update(workspaceGithubConnections)
          .set({
            coolifyGithubAppUuid: sourceUuid,
            providerSyncStatus: "ready",
            providerSyncError: null,
            updatedAt: new Date(),
          })
          .where(eq(workspaceGithubConnections.id, connectionId));
      } catch (error) {
        providerSyncStatus = "failed";
        await db
          .update(workspaceGithubConnections)
          .set({
            providerSyncStatus: "failed",
            providerSyncError:
              error instanceof Error
                ? error.message.slice(0, 2000)
                : "Provider synchronization failed.",
            updatedAt: new Date(),
          })
          .where(eq(workspaceGithubConnections.id, connectionId));
      }
      await recordAuditLog({
        action: "github_connection.connected",
        actorUserId: context.actorUserId,
        resourceType: "workspace_github_connection",
        resourceId: connectionId,
        metadata: {
          workspacePublicId: context.workspacePublicId,
          accountLogin: installation.account.login,
        },
      });
      const target = new URL(`/dashboard/applications/create`, url.origin);
      target.searchParams.set("github", existing?.status === "active" ? "existing" : "connected");
      target.searchParams.set("connection_id", connectionId);
      target.searchParams.set("provider", providerSyncStatus);
      return Response.redirect(target, 302);
    } catch (error) {
      const target = new URL("/dashboard/applications/create", url.origin);
      target.searchParams.set(
        "github_error",
        error instanceof Error ? error.message : "GitHub connection failed.",
      );
      return Response.redirect(target, 302);
    }
  }
  public static async repositories(
    request: Request,
    workspacePublicId: number,
    connectionId: string,
    metadata: RequestMetadata,
  ): Promise<Response> {
    try {
      const workspace = await applicationWorkspaceAccess(
        request,
        workspacePublicId,
        metadata,
      );
      const [connection] = await db
        .select()
        .from(workspaceGithubConnections)
        .where(
          and(
            eq(workspaceGithubConnections.id, connectionId),
            eq(workspaceGithubConnections.workspaceId, workspace.id),
            eq(workspaceGithubConnections.status, "active"),
            isNull(workspaceGithubConnections.deletedAt),
          ),
        )
        .limit(1);
      if (!connection)
        return resp.failure(
          "GitHub connection not found.",
          resp.codes.RESOURCE_NOT_FOUND,
          undefined,
          null,
          undefined,
          404,
        );
      return resp.success(
        "Accessible repositories retrieved.",
        await githubInstallationRepositories(connection.installationId),
      );
    } catch (error) {
      return resp.failure(
        error instanceof Error
          ? error.message
          : "Unable to load GitHub repositories.",
        resp.codes.EXTERNAL_SERVICE_ERROR,
        undefined,
        null,
        undefined,
        502,
      );
    }
  }

  public static async sync(
    request: Request,
    workspacePublicId: number,
    connectionId: string,
    metadata: RequestMetadata,
  ): Promise<Response> {
    let ownedConnectionId: string | undefined;
    try {
      const workspace = await applicationWorkspaceAccess(
        request,
        workspacePublicId,
        metadata,
      );
      const [connection] = await db
        .select()
        .from(workspaceGithubConnections)
        .where(
          and(
            eq(workspaceGithubConnections.id, connectionId),
            eq(workspaceGithubConnections.workspaceId, workspace.id),
            eq(workspaceGithubConnections.status, "active"),
            isNull(workspaceGithubConnections.deletedAt),
          ),
        )
        .limit(1);
      if (!connection)
        return resp.failure(
          "GitHub connection not found.",
          resp.codes.RESOURCE_NOT_FOUND,
          undefined,
          null,
          undefined,
          404,
        );
      ownedConnectionId = connection.id;
      const sourceUuid = await syncCoolifyGithubSource({
        accountLogin: connection.accountLogin,
        accountType: connection.accountType,
        installationId: connection.installationId,
        workspacePublicId,
      });
      await db
        .update(workspaceGithubConnections)
        .set({
          coolifyGithubAppUuid: sourceUuid,
          providerSyncStatus: "ready",
          providerSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(workspaceGithubConnections.id, connection.id));
      await recordAuditLog({
        action: "github_connection.provider_synced",
        actorUserId: workspace.actorUserId,
        resourceType: "workspace_github_connection",
        resourceId: connection.id,
        metadata: { workspacePublicId },
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
      return resp.success(
        "GitHub deployment provider synchronized.",
        { providerSyncStatus: "ready" },
        resp.codes.UPDATED,
      );
    } catch (error) {
      if (ownedConnectionId)
        await db
          .update(workspaceGithubConnections)
          .set({
            providerSyncStatus: "failed",
            providerSyncError:
              error instanceof Error
                ? error.message.slice(0, 2000)
                : "Provider synchronization failed.",
            updatedAt: new Date(),
          })
          .where(eq(workspaceGithubConnections.id, ownedConnectionId));
      return resp.failure(
        error instanceof Error
          ? error.message
          : "Provider synchronization failed.",
        resp.codes.EXTERNAL_SERVICE_ERROR,
        undefined,
        null,
        undefined,
        502,
      );
    }
  }
}
