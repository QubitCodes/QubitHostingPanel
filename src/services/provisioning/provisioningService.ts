import { and, asc, eq, inArray, isNull, lt, lte } from "drizzle-orm";

import { getEnvironment } from "@config/env";
import { frameworkDefinition } from "@config/frameworkCatalog";
import { db } from "@db/client";
import {
  applicationBuilds,
  applicationDatabaseBindings,
  applicationDeployments,
  applicationDomains,
  customerCheckouts,
  databaseClusters,
  logicalDatabases,
  provisioningJobs,
  runtimeImages,
  workspaceResources,
} from "@db/schema";
import {
  buildSafeInstallCommand,
  frameworkEnvironmentDefaults,
} from "@services/applications/deploymentRecipeService";
import { frameworkDatabaseEnvironment } from "@services/applications/frameworkDatabaseEnvironmentService";
import { databaseClusterEndpoint } from "@services/databases/databaseClusterEndpointService";
import { decryptCredential } from "@services/encryption/credentialEncryptionService";
import { hostingProvider } from "@services/hosting/hostingProviderFactory";
import { nixpacksRuntimeVersion } from "@services/provisioning/runtimeCompatibilityService";
import {
  ensureApplicationTracker,
  publishApplicationEvent,
} from "@services/applications/applicationRealtimeService";

/** Marks provider states that cannot improve without a new explicit deployment. */
class TerminalProvisioningError extends Error {}

/** Queues exactly one initial application provision per subscription. */
export async function queueInitialProvisioning(
  workspaceId: string,
  subscriptionId: string,
  checkoutId: string,
  workspaceName: string,
): Promise<string> {
  const environment = getEnvironment();
  const provider = environment.HOSTING_PROVIDER;
  const idempotencyKey = `subscription:${subscriptionId}:initial-application`;
  const [job] = await db
    .insert(provisioningJobs)
    .values({
      workspaceId,
      subscriptionId,
      provider,
      idempotencyKey,
      input: { checkoutId, workspaceName },
    })
    .onConflictDoNothing()
    .returning({ id: provisioningJobs.id });
  if (job) return job.id;
  const [existing] = await db
    .select({ id: provisioningJobs.id })
    .from(provisioningJobs)
    .where(
      and(
        eq(provisioningJobs.idempotencyKey, idempotencyKey),
        isNull(provisioningJobs.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("Unable to queue provisioning.");
  return existing.id;
}

/** Claims and processes bounded provisioning jobs. Safe to invoke from cron or after checkout setup. */
export async function processProvisioningJobs(
  limit = 5,
): Promise<{ failed: number; processed: number; succeeded: number }> {
  let failed = 0;
  let processed = 0;
  let succeeded = 0;
  for (let index = 0; index < limit; index += 1) {
    const now = new Date();
    const [candidate] = await db
      .select()
      .from(provisioningJobs)
      .where(
        and(
          inArray(provisioningJobs.status, ["queued", "failed"]),
          lt(provisioningJobs.attemptCount, provisioningJobs.maximumAttempts),
          lte(provisioningJobs.nextAttemptAt, now),
          isNull(provisioningJobs.deletedAt),
        ),
      )
      .orderBy(asc(provisioningJobs.createdAt))
      .limit(1);
    if (!candidate) break;
    const [claimed] = await db
      .update(provisioningJobs)
      .set({
        status: "processing",
        lockedAt: now,
        attemptCount: candidate.attemptCount + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(provisioningJobs.id, candidate.id),
          inArray(provisioningJobs.status, ["queued", "failed"]),
        ),
      )
      .returning();
    if (!claimed) continue;
    processed += 1;
    try {
      const input = claimed.input as {
        applicationBuildId?: string;
        checkoutId?: string;
        deploymentId?: string;
        workspaceName?: string;
      };
      const provider = await hostingProvider();
      const [configuredApplication] = input.applicationBuildId
        ? await db
            .select({ build: applicationBuilds, runtime: runtimeImages })
            .from(applicationBuilds)
            .innerJoin(
              runtimeImages,
              eq(runtimeImages.id, applicationBuilds.runtimeImageId),
            )
            .where(
              and(
                eq(applicationBuilds.id, input.applicationBuildId),
                eq(applicationBuilds.workspaceId, claimed.workspaceId),
                isNull(applicationBuilds.deletedAt),
              ),
            )
            .limit(1)
        : [];
      const applicationMetadata = configuredApplication?.build.metadata as
        | {
            buildPack?: "dockerfile" | "nixpacks" | "static";
            coolifyGithubAppUuid?: string;
            deploymentContract?: Record<string, unknown>;
            name?: string;
          }
        | undefined;
      const resourceName = `${String(
        applicationMetadata?.name ?? input.workspaceName ?? "workspace",
      )
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40)}-${claimed.workspaceId.slice(0, 8)}`;
      /** Resolves secrets only when submitting or retrying a provider deployment. */
      const deploymentInput = async () => {
        let databaseEnvironment: Array<{
          key: string;
          scope?: "build" | "both" | "runtime";
          value: string;
        }> = [];
        let domains: string[] = [];
        if (configuredApplication) {
          domains = (
            await db
              .select({ hostname: applicationDomains.hostname })
              .from(applicationDomains)
              .where(
                and(
                  eq(
                    applicationDomains.applicationBuildId,
                    configuredApplication.build.id,
                  ),
                  eq(applicationDomains.isEnabled, true),
                  eq(applicationDomains.status, "verified"),
                  isNull(applicationDomains.deletedAt),
                ),
              )
          ).map(({ hostname }) => hostname);
          const bindings = await db
            .select({
              prefix: applicationDatabaseBindings.environmentPrefix,
              database: logicalDatabases,
              cluster: databaseClusters,
            })
            .from(applicationDatabaseBindings)
            .innerJoin(
              logicalDatabases,
              eq(
                logicalDatabases.id,
                applicationDatabaseBindings.logicalDatabaseId,
              ),
            )
            .innerJoin(
              databaseClusters,
              eq(databaseClusters.id, logicalDatabases.clusterId),
            )
            .where(
              and(
                eq(
                  applicationDatabaseBindings.applicationBuildId,
                  configuredApplication.build.id,
                ),
                isNull(applicationDatabaseBindings.deletedAt),
                isNull(logicalDatabases.deletedAt),
              ),
            );
          databaseEnvironment = bindings.flatMap(
            ({ prefix, database, cluster }) => {
              const credential = JSON.parse(
                decryptCredential(database.credentialCiphertext),
              ) as { databaseName: string; password: string; username: string };
              const endpoint = databaseClusterEndpoint(cluster);
              const common = [
                { key: `${prefix}_ENGINE`, value: cluster.engine },
                { key: `${prefix}_HOST`, value: endpoint.host },
                { key: `${prefix}_PORT`, value: String(endpoint.port) },
                { key: `${prefix}_DATABASE`, value: credential.databaseName },
                { key: `${prefix}_USERNAME`, value: credential.username },
                { key: `${prefix}_PASSWORD`, value: credential.password },
              ];
              return [
                ...common,
                ...frameworkDatabaseEnvironment(
                  configuredApplication.build.framework,
                  {
                    databaseName: credential.databaseName,
                    engine: cluster.engine,
                    host: endpoint.host,
                    password: credential.password,
                    port: endpoint.port,
                    username: credential.username,
                  },
                ),
              ];
            },
          );
          databaseEnvironment.push(
            ...frameworkEnvironmentDefaults(
              configuredApplication.build.framework,
            ),
          );
          const runtimeVersionVariable =
            configuredApplication.runtime.language === "node"
              ? "NIXPACKS_NODE_VERSION"
              : configuredApplication.runtime.language === "python"
                ? "NIXPACKS_PYTHON_VERSION"
                : configuredApplication.runtime.language === "php"
                  ? "NIXPACKS_PHP_VERSION"
                  : configuredApplication.runtime.language === "ruby"
                    ? "NIXPACKS_RUBY_VERSION"
                    : undefined;
          if (runtimeVersionVariable)
            databaseEnvironment.push({
              key: runtimeVersionVariable,
              scope: "build",
              value: nixpacksRuntimeVersion(
                configuredApplication.runtime.language,
                configuredApplication.runtime.version,
              ),
            });
          await db
            .update(applicationBuilds)
            .set({
              status: "building",
              startedAt: new Date(),
              failureReason: null,
              updatedAt: new Date(),
            })
            .where(eq(applicationBuilds.id, configuredApplication.build.id));
          if (input.deploymentId)
            await db
              .update(applicationDeployments)
              .set({
                status: "deploying",
                startedAt: new Date(),
                failureReason: null,
                updatedAt: new Date(),
              })
              .where(eq(applicationDeployments.id, input.deploymentId));
        }
        const environmentVariables = configuredApplication?.build
          .environmentVariablesCiphertext
          ? (JSON.parse(
              decryptCredential(
                configuredApplication.build.environmentVariablesCiphertext,
              ),
            ) as Array<{
              key: string;
              value: string;
              scope: "runtime" | "build" | "both";
            }>)
          : [];
        return {
          autoDeployEnabled: configuredApplication?.build.autoDeployEnabled,
          name: resourceName,
          persistentStorages: frameworkDefinition(
            configuredApplication?.build.framework,
          )?.persistentDirectories?.map((directory) => ({
            mountPath: `/app/${directory.replace(/^\/+/, "")}`,
            name: `${resourceName}-${directory}`
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 63),
          })),
          workspaceId: claimed.workspaceId,
          source: configuredApplication
            ? {
                repository: configuredApplication.build.sourceRepository,
                branch: configuredApplication.build.sourceRef,
                githubAppUuid: applicationMetadata?.coolifyGithubAppUuid,
              }
            : undefined,
          buildPack: applicationMetadata?.buildPack,
          installCommand: buildSafeInstallCommand(
            configuredApplication?.build.installCommand ?? undefined,
            configuredApplication?.build.buildCommand ?? undefined,
          ),
          buildCommand: configuredApplication?.build.buildCommand ?? undefined,
          startCommand: configuredApplication?.build.startCommand ?? undefined,
          baseDirectory: configuredApplication?.build.baseDirectory,
          publishDirectory:
            configuredApplication?.build.publishDirectory ?? undefined,
          domains,
          healthCheckPath:
            typeof applicationMetadata?.deploymentContract === "object" &&
            applicationMetadata.deploymentContract !== null &&
            typeof (
              applicationMetadata.deploymentContract as Record<string, unknown>
            ).healthCheckPath === "string"
              ? String(
                  (
                    applicationMetadata.deploymentContract as Record<
                      string,
                      unknown
                    >
                  ).healthCheckPath,
                )
              : "/",
          databaseEnvironment,
          environmentVariables,
          deploymentEnvironment:
            configuredApplication?.build.deploymentEnvironment,
          runtimeImage: configuredApplication
            ? {
                repository: `${configuredApplication.runtime.registry}/${configuredApplication.runtime.repository}`,
                tag: configuredApplication.runtime.tag,
                port: configuredApplication.build.applicationPort,
              }
            : undefined,
        };
      };
      /**
       * An application owns one long-lived provider resource, while each
       * deployment can have a new provisioning job. Resolve the resource from
       * the application first so retries and later deployments cannot create
       * duplicate Coolify applications merely because their job IDs differ.
       */
      const [existingResource] = await db
        .select()
        .from(workspaceResources)
        .where(
          and(
            configuredApplication?.build.resourceId
              ? eq(
                  workspaceResources.id,
                  configuredApplication.build.resourceId,
                )
              : eq(workspaceResources.provisioningJobId, claimed.id),
            eq(workspaceResources.workspaceId, claimed.workspaceId),
            isNull(workspaceResources.deletedAt),
          ),
        )
        .limit(1);
      if (existingResource) {
        const previousResult = claimed.result as {
          providerResourceId?: string;
        };
        /**
         * A newly-created deployment job has not submitted work to Coolify
         * yet. Submit exactly once, record the provider resource, then let
         * later worker passes poll it. A failed poll must never submit another
         * deployment implicitly; an explicit user retry creates a new job.
         */
        if (!previousResult.providerResourceId && configuredApplication) {
          const redeployment = await provider.provisionApplication(
            await deploymentInput(),
          );
          await db.transaction(async (transaction) => {
            await transaction
              .update(workspaceResources)
              .set({
                status: "provisioning",
                publicUrl: redeployment.publicUrl ?? existingResource.publicUrl,
                lastReconciledAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(workspaceResources.id, existingResource.id));
            await transaction
              .update(provisioningJobs)
              .set({
                status: "queued",
                lockedAt: null,
                nextAttemptAt: new Date(Date.now() + 30_000),
                result: {
                  providerResourceId: existingResource.providerResourceId,
                  providerStatus: redeployment.status,
                  publicUrl:
                    redeployment.publicUrl ?? existingResource.publicUrl,
                },
                lastError: null,
                updatedAt: new Date(),
              })
              .where(eq(provisioningJobs.id, claimed.id));
            if (input.applicationBuildId)
              await transaction
                .update(applicationBuilds)
                .set({
                  status: "building",
                  failureReason: null,
                  updatedAt: new Date(),
                })
                .where(eq(applicationBuilds.id, input.applicationBuildId));
            if (input.deploymentId)
              await transaction
                .update(applicationDeployments)
                .set({
                  status: "deploying",
                  resourceId: existingResource.id,
                  providerDeploymentId: existingResource.providerResourceId,
                  publicUrl:
                    redeployment.publicUrl ?? existingResource.publicUrl,
                  failureReason: null,
                  updatedAt: new Date(),
                })
                .where(eq(applicationDeployments.id, input.deploymentId));
          });
          if (input.applicationBuildId) {
            publishApplicationEvent({
              applicationId: input.applicationBuildId,
              deploymentStatus: "deploying",
              providerStatus: "provisioning",
              type: "deployment",
            });
            ensureApplicationTracker(
              input.applicationBuildId,
              existingResource.providerResourceId,
            );
          }
          continue;
        }
        const providerStatus = await provider.getDeployment(
          existingResource.providerResourceId,
        );
        if (providerStatus === "failed") {
          await db
            .update(workspaceResources)
            .set({
              status: "failed",
              lastReconciledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(workspaceResources.id, existingResource.id));
          throw new TerminalProvisioningError(
            "The provider reports that deployment failed.",
          );
        }
        if (providerStatus !== "succeeded") {
          await db.transaction(async (transaction) => {
            await transaction
              .update(workspaceResources)
              .set({
                status: "provisioning",
                lastReconciledAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(workspaceResources.id, existingResource.id));
            await transaction
              .update(provisioningJobs)
              .set({
                status: "queued",
                lockedAt: null,
                nextAttemptAt: new Date(Date.now() + 30_000),
                result: {
                  providerResourceId: existingResource.providerResourceId,
                  providerStatus,
                },
                updatedAt: new Date(),
              })
              .where(eq(provisioningJobs.id, claimed.id));
          });
          continue;
        }
        await db.transaction(async (transaction) => {
          await transaction
            .update(workspaceResources)
            .set({
              status: "running",
              lastReconciledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(workspaceResources.id, existingResource.id));
          await transaction
            .update(provisioningJobs)
            .set({
              status: "succeeded",
              completedAt: new Date(),
              lockedAt: null,
              result: {
                providerResourceId: existingResource.providerResourceId,
                providerStatus,
              },
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(provisioningJobs.id, claimed.id));
          if (input.applicationBuildId)
            await transaction
              .update(applicationBuilds)
              .set({
                status: "succeeded",
                completedAt: new Date(),
                failureReason: null,
                updatedAt: new Date(),
              })
              .where(eq(applicationBuilds.id, input.applicationBuildId));
          if (input.deploymentId)
            await transaction
              .update(applicationDeployments)
              .set({
                status: "running",
                resourceId: existingResource.id,
                providerDeploymentId: existingResource.providerResourceId,
                publicUrl: existingResource.publicUrl,
                completedAt: new Date(),
                failureReason: null,
                updatedAt: new Date(),
              })
              .where(eq(applicationDeployments.id, input.deploymentId));
          if (input.checkoutId)
            await transaction
              .update(customerCheckouts)
              .set({ status: "active", updatedAt: new Date() })
              .where(eq(customerCheckouts.id, input.checkoutId));
        });
        succeeded += 1;
        continue;
      }
      const result = await provider.provisionApplication(
        await deploymentInput(),
      );
      await db.transaction(async (transaction) => {
        const [resource] = await transaction
          .insert(workspaceResources)
          .values({
            workspaceId: claimed.workspaceId,
            provisioningJobId: claimed.id,
            provider: claimed.provider,
            kind: "application",
            name: resourceName,
            providerResourceId: result.id,
            status: result.status === "succeeded" ? "running" : "provisioning",
            publicUrl: result.publicUrl,
            metadata: {
              checkoutId: input.checkoutId,
              applicationBuildId: input.applicationBuildId,
            },
            lastReconciledAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: workspaceResources.id });
        if (input.applicationBuildId && resource)
          await transaction
            .update(applicationBuilds)
            .set({
              resourceId: resource.id,
              providerBuildId: result.id,
              status: result.status === "succeeded" ? "succeeded" : "building",
              completedAt: result.status === "succeeded" ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(applicationBuilds.id, input.applicationBuildId));
        if (input.deploymentId && resource)
          await transaction
            .update(applicationDeployments)
            .set({
              resourceId: resource.id,
              providerDeploymentId: result.id,
              status: result.status === "succeeded" ? "running" : "deploying",
              publicUrl: result.publicUrl,
              completedAt: result.status === "succeeded" ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(applicationDeployments.id, input.deploymentId));
        await transaction
          .update(provisioningJobs)
          .set({
            status: result.status === "succeeded" ? "succeeded" : "queued",
            completedAt: result.status === "succeeded" ? new Date() : null,
            lockedAt: null,
            nextAttemptAt: new Date(Date.now() + 30_000),
            result: {
              providerResourceId: result.id,
              providerStatus: result.status,
              publicUrl: result.publicUrl,
            },
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(provisioningJobs.id, claimed.id));
        if (result.status === "succeeded" && input.checkoutId)
          await transaction
            .update(customerCheckouts)
            .set({ status: "active", updatedAt: new Date() })
            .where(eq(customerCheckouts.id, input.checkoutId));
      });
      if (result.status === "succeeded") succeeded += 1;
    } catch (error) {
      failed += 1;
      const terminal = error instanceof TerminalProvisioningError;
      const delayMinutes = Math.min(60, 2 ** claimed.attemptCount);
      await db
        .update(provisioningJobs)
        .set({
          status: "failed",
          attemptCount: terminal
            ? claimed.maximumAttempts
            : claimed.attemptCount,
          completedAt: terminal ? new Date() : null,
          lockedAt: null,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 2000)
              : "Unknown provisioning error.",
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(provisioningJobs.id, claimed.id));
      const failedInput = claimed.input as {
        applicationBuildId?: string;
        deploymentId?: string;
      };
      if (failedInput.applicationBuildId)
        await db
          .update(applicationBuilds)
          .set({
            status: "failed",
            failureReason:
              error instanceof Error
                ? error.message.slice(0, 2000)
                : "Unknown provisioning error.",
            updatedAt: new Date(),
          })
          .where(eq(applicationBuilds.id, failedInput.applicationBuildId));
      if (failedInput.deploymentId)
        await db
          .update(applicationDeployments)
          .set({
            status: "failed",
            failureReason:
              error instanceof Error
                ? error.message.slice(0, 2000)
                : "Unknown provisioning error.",
            updatedAt: new Date(),
          })
          .where(eq(applicationDeployments.id, failedInput.deploymentId));
    }
  }
  return { failed, processed, succeeded };
}
