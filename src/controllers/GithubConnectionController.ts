import { and, eq, isNull } from "drizzle-orm";
import { resp } from "@qubitcodes/qcresp";

import { db } from "@db/client";
import { getEnvironment } from "@config/env";
import { workspaceGithubConnections } from "@db/schema";
import { applicationWorkspaceAccess } from "@controllers/ApplicationController";
import {
  githubInstallation,
  githubInstallationRepositories,
  githubInstallationUrl,
  createGithubInstallationState,
  verifyGithubInstallationState,
} from "@services/github/githubAppService";
import { recordAuditLog } from "@services/auditLogService";
import type { RequestMetadata } from "@utils/request";

const publicFields = {
  id: workspaceGithubConnections.id,
  accountLogin: workspaceGithubConnections.accountLogin,
  accountName: workspaceGithubConnections.accountName,
  accountType: workspaceGithubConnections.accountType,
  avatarUrl: workspaceGithubConnections.avatarUrl,
  installationId: workspaceGithubConnections.installationId,
  status: workspaceGithubConnections.status,
  updatedAt: workspaceGithubConnections.updatedAt,
};

export class GithubConnectionController {
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
          reviewUrl: `https://github.com/settings/installations/${row.installationId}`,
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
        .select({ id: workspaceGithubConnections.id })
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
        coolifyGithubAppUuid: getEnvironment().COOLIFY_GITHUB_APP_UUID ?? null,
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
      await recordAuditLog({
        action: "github_connection.connected",
        actorUserId: context.actorUserId,
        resourceType: "workspace_github_connection",
        resourceId: connection[0]?.id,
        metadata: {
          workspacePublicId: context.workspacePublicId,
          accountLogin: installation.account.login,
        },
      });
      return Response.redirect(
        new URL(`/dashboard/applications/create?github=connected`, url.origin),
        302,
      );
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
}
