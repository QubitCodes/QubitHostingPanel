import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { resp } from '@qubitcodes/qcresp';

import { frameworkDefinition } from '@config/frameworkCatalog';
import { db } from '@db/client';
import {
	applicationBuilds,
	applicationDatabaseBindings,
	applicationDeployments,
	applicationDomains,
	customers,
	databaseClusters,
	domainAccessRequests,
	domainOwnerships,
	logicalDatabases,
	provisioningJobs,
	runtimeImages,
	workspaceMemberships,
	workspaceResources,
	workspaces,
	workspaceSubscriptions,
	workspaceGithubConnections,
} from '@db/schema';
import type {
	AnalyzeApplicationSourceRequest,
	CreateApplicationRequest,
	UpdateApplicationRequest,
	ApplicationActionRequest,
	DeleteApplicationRequest,
} from '@schemas/application';
import { recordAuditLog } from '@services/auditLogService';
import { authenticateSession } from '@services/auth/authenticatedSessionService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';
import { getEffectivePlatformUrls } from '@services/platformUrlService';
import { analyzeApplicationSource } from '@services/applications/sourceDetectionService';
import { resolveDeploymentContract } from '@services/applications/deploymentRecipeService';
import { diagnoseDeploymentLogs } from '@services/applications/deploymentDiagnosticService';
import { parseDeploymentLogs } from '@services/applications/deploymentLogParserService';
import { currentApplicationProviderStatuses } from '@services/applications/applicationProviderStatusService';
import {
	ensureApplicationTracker,
	publishApplicationEvent,
	subscribeApplicationEvents,
} from '@services/applications/applicationRealtimeService';
import { processProvisioningJobs } from '@services/provisioning/provisioningService';
import {
	decryptCredential,
	encryptCredential,
} from '@services/encryption/credentialEncryptionService';
import { LogicalDatabaseController } from '@controllers/LogicalDatabaseController';
import {
	githubInstallationRepositories,
	githubInstallationToken,
} from '@services/github/githubAppService';
import {
	controllingOwnership,
	ownershipVerificationEnabled,
	workspaceOwnershipClaim,
} from '@services/domains/domainOwnershipService';
import {
	commitUsageReservation,
	releaseUsageReservation,
	reserveWorkspaceUsage,
} from '@services/usage/quotaEngine';
import { effectiveEntitlement } from '@services/usage/quotaEngine';
import type { RequestMetadata } from '@utils/request';

async function access(
	request: Request,
	publicId: number,
	metadata: RequestMetadata,
) {
	const actor = await authenticateSession(request, metadata);
	const [row] = await db
		.select({
			id: workspaces.id,
			subscriptionId: workspaceSubscriptions.id,
			entitlementSnapshot: workspaceSubscriptions.entitlementSnapshot,
		})
		.from(customers)
		.innerJoin(
			workspaceMemberships,
			and(
				eq(workspaceMemberships.customerId, customers.id),
				eq(workspaceMemberships.status, 'active'),
				isNull(workspaceMemberships.deletedAt),
			),
		)
		.innerJoin(
			workspaces,
			and(
				eq(workspaces.id, workspaceMemberships.workspaceId),
				eq(workspaces.publicId, publicId),
				eq(workspaces.status, 'active'),
				isNull(workspaces.deletedAt),
			),
		)
		.innerJoin(
			workspaceSubscriptions,
			and(
				eq(workspaceSubscriptions.workspaceId, workspaces.id),
				sql`${workspaceSubscriptions.status} IN ('active', 'trialing')`,
				isNull(workspaceSubscriptions.deletedAt),
			),
		)
		.where(and(eq(customers.userId, actor.userId), isNull(customers.deletedAt)))
		.limit(1);
	if (!row) throw new Error('Workspace not found.');
	return { ...row, actorUserId: actor.userId };
}
export { access as applicationWorkspaceAccess };
const fields = {
	id: applicationBuilds.id,
	status: applicationBuilds.status,
	sourceRepository: applicationBuilds.sourceRepository,
	sourceRef: applicationBuilds.sourceRef,
	installCommand: applicationBuilds.installCommand,
	buildCommand: applicationBuilds.buildCommand,
	startCommand: applicationBuilds.startCommand,
	baseDirectory: applicationBuilds.baseDirectory,
	publishDirectory: applicationBuilds.publishDirectory,
	applicationPort: applicationBuilds.applicationPort,
	requestedDomain: applicationBuilds.requestedDomain,
	failureReason: applicationBuilds.failureReason,
	metadata: applicationBuilds.metadata,
	operationalStatus: applicationBuilds.operationalStatus,
	visibility: applicationBuilds.visibility,
	autoDeployEnabled: applicationBuilds.autoDeployEnabled,
	createdAt: applicationBuilds.createdAt,
	runtimeCode: runtimeImages.code,
	runtimeLanguage: runtimeImages.language,
	runtimeVersion: runtimeImages.version,
	resourceStatus: workspaceResources.status,
	providerResourceId: workspaceResources.providerResourceId,
	publicUrl: workspaceResources.publicUrl,
};

/** Workspace-owned source application configuration and deployment lifecycle. */
export class ApplicationController {
	public static async analyzeSource(
		request: Request,
		workspacePublicId: number,
		input: AnalyzeApplicationSourceRequest,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await access(request, workspacePublicId, metadata);
			let token: string | undefined;
			if (input.githubConnectionId) {
				const [connection] = await db
					.select()
					.from(workspaceGithubConnections)
					.where(
						and(
							eq(workspaceGithubConnections.id, input.githubConnectionId),
							eq(workspaceGithubConnections.workspaceId, workspace.id),
							eq(workspaceGithubConnections.status, 'active'),
							isNull(workspaceGithubConnections.deletedAt),
						),
					)
					.limit(1);
				if (!connection)
					return resp.failure(
						'GitHub connection not found.',
						resp.codes.RESOURCE_NOT_FOUND,
						undefined,
						null,
						undefined,
						404,
					);
				token = await githubInstallationToken(connection.installationId);
			}
			return resp.success(
				'Repository analysis completed.',
				await analyzeApplicationSource(input.repository, input.branch, token),
			);
		} catch (error) {
			return resp.failure(
				error instanceof Error ? error.message : 'Repository analysis failed.',
				resp.codes.EXTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				422,
			);
		}
	}
	public static async options(
		request: Request,
		workspacePublicId: number,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await access(request, workspacePublicId, metadata);
			const [runtimes, databases, ownerships, attachedDomains] =
				await Promise.all([
					db
						.select({
							code: runtimeImages.code,
							language: runtimeImages.language,
							version: runtimeImages.version,
							defaultPort: runtimeImages.defaultPort,
							isDefault: runtimeImages.isDefault,
						})
						.from(runtimeImages)
						.where(
							and(
								eq(runtimeImages.status, 'active'),
								isNull(runtimeImages.deletedAt),
							),
						)
						.orderBy(asc(runtimeImages.language), asc(runtimeImages.version)),
					db
						.select({
							id: logicalDatabases.id,
							databaseName: logicalDatabases.databaseName,
						})
						.from(logicalDatabases)
						.where(
							and(
								eq(logicalDatabases.workspaceId, workspace.id),
								eq(logicalDatabases.status, 'active'),
								isNull(logicalDatabases.deletedAt),
							),
						)
						.orderBy(asc(logicalDatabases.databaseName)),
					db
						.select({
							id: domainOwnerships.id,
							hostname: domainOwnerships.hostname,
							status: domainOwnerships.status,
						})
						.from(domainOwnerships)
						.where(
							and(
								eq(domainOwnerships.workspaceId, workspace.id),
								sql`${domainOwnerships.status} <> 'revoked'`,
								isNull(domainOwnerships.deletedAt),
							),
						)
						.orderBy(asc(domainOwnerships.hostname)),
					db
						.select({ hostname: applicationDomains.hostname })
						.from(applicationDomains)
						.innerJoin(
							applicationBuilds,
							and(
								eq(applicationBuilds.id, applicationDomains.applicationBuildId),
								eq(applicationBuilds.workspaceId, workspace.id),
								isNull(applicationBuilds.deletedAt),
							),
						)
						.where(
							and(
								eq(applicationDomains.type, 'custom'),
								isNull(applicationDomains.deletedAt),
							),
						),
				]);
			const platform = await getEffectivePlatformUrls();
			const [
				domainEntitlement,
				databaseEntitlement,
				manualDeploymentEntitlement,
				autoDeploymentEntitlement,
				[{ customDomainCount }],
			] = await Promise.all([
				effectiveEntitlement(workspace.id, 'domains.count'),
				effectiveEntitlement(workspace.id, 'databases.count'),
				effectiveEntitlement(workspace.id, 'deployments.manual_enabled'),
				effectiveEntitlement(workspace.id, 'deployments.auto_enabled'),
				db
					.select({ customDomainCount: count() })
					.from(applicationDomains)
					.innerJoin(
						applicationBuilds,
						eq(applicationBuilds.id, applicationDomains.applicationBuildId),
					)
					.where(
						and(
							eq(applicationBuilds.workspaceId, workspace.id),
							eq(applicationDomains.type, 'custom'),
							isNull(applicationDomains.deletedAt),
							isNull(applicationBuilds.deletedAt),
						),
					),
			]);
			return resp.success('Application options retrieved.', {
				runtimes,
				databases,
				availableDomains: ownerships.map((ownership) => ({
					...ownership,
					attachedHostnames: attachedDomains
						.filter(
							({ hostname }) =>
								hostname === ownership.hostname ||
								hostname.endsWith(`.${ownership.hostname}`),
						)
						.map(({ hostname }) => hostname),
					rootAvailable: !attachedDomains.some(
						({ hostname }) => hostname === ownership.hostname,
					),
				})),
				applicationBaseDomain: platform.applicationBaseDomain,
				applicationDomainReady: platform.applicationDomainReady,
				suggestedDomainSuffix: randomBytes(4)
					.toString('base64url')
					.toLowerCase()
					.replace(/[^a-z0-9]/g, '')
					.slice(0, 6)
					.padEnd(6, '0'),
				limits: {
					deployments: {
						autoEnabled: autoDeploymentEntitlement.booleanValue === true,
						manualEnabled: manualDeploymentEntitlement.booleanValue !== false,
					},
					databases: {
						allowed:
							databaseEntitlement.isUnlimited ||
							databases.length < databaseEntitlement.limit,
						current: databases.length,
						limit: databaseEntitlement.isUnlimited
							? null
							: databaseEntitlement.limit,
					},
					customDomains: {
						allowed:
							domainEntitlement.isUnlimited ||
							Number(customDomainCount) < domainEntitlement.limit,
						current: Number(customDomainCount),
						limit: domainEntitlement.isUnlimited
							? null
							: domainEntitlement.limit,
					},
				},
			});
		} catch {
			return resp.failure(
				'Workspace not found.',
				resp.codes.RESOURCE_NOT_FOUND,
				undefined,
				null,
				undefined,
				404,
			);
		}
	}
	public static async index(
		request: Request,
		workspacePublicId: number,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await access(request, workspacePublicId, metadata);
			const rows = await db
				.select(fields)
				.from(applicationBuilds)
				.innerJoin(
					runtimeImages,
					eq(runtimeImages.id, applicationBuilds.runtimeImageId),
				)
				.leftJoin(
					workspaceResources,
					eq(workspaceResources.id, applicationBuilds.resourceId),
				)
				.where(
					and(
						eq(applicationBuilds.workspaceId, workspace.id),
						isNull(applicationBuilds.deletedAt),
					),
				)
				.orderBy(desc(applicationBuilds.createdAt));
			const ids = rows.map(({ id }) => id);
			const [domains, bindings, deployments, providerStatuses] = ids.length
				? await Promise.all([
						db
							.select()
							.from(applicationDomains)
							.where(
								and(
									inArray(applicationDomains.applicationBuildId, ids),
									isNull(applicationDomains.deletedAt),
								),
							)
							.orderBy(asc(applicationDomains.createdAt)),
						db
							.select({
								applicationBuildId:
									applicationDatabaseBindings.applicationBuildId,
								databaseId: logicalDatabases.id,
								databaseName: logicalDatabases.databaseName,
								environmentPrefix:
									applicationDatabaseBindings.environmentPrefix,
							})
							.from(applicationDatabaseBindings)
							.innerJoin(
								logicalDatabases,
								eq(
									logicalDatabases.id,
									applicationDatabaseBindings.logicalDatabaseId,
								),
							)
							.where(
								and(
									inArray(applicationDatabaseBindings.applicationBuildId, ids),
									isNull(applicationDatabaseBindings.deletedAt),
									isNull(logicalDatabases.deletedAt),
								),
							),
						db
							.select()
							.from(applicationDeployments)
							.where(
								and(
									inArray(applicationDeployments.applicationBuildId, ids),
									isNull(applicationDeployments.deletedAt),
								),
							)
							.orderBy(desc(applicationDeployments.createdAt)),
						currentApplicationProviderStatuses().catch(
							() => new Map<string, string>(),
						),
					])
				: [[], [], [], new Map<string, string>()];
			return resp.success(
				'Applications retrieved.',
				rows.map(({ providerResourceId, ...row }) => {
					const latestDeployment = deployments.find(
						(deployment) => deployment.applicationBuildId === row.id,
					);
					const providerStatus =
						(providerResourceId
							? providerStatuses.get(providerResourceId)
							: undefined) ?? row.resourceStatus;
					const deploymentInProgress = /queued|pending|building|starting|progress|deploying|provision/i.test(
						`${row.status} ${latestDeployment?.status ?? ''}`,
					);
					return {
					...row,
					resourceStatus: deploymentInProgress
						? (latestDeployment?.status ?? row.status ?? 'provisioning')
						: providerStatus,
					name: String(
						row.metadata?.name ??
							row.sourceRepository.split('/').pop() ??
							'Application',
					),
					buildPack: String(row.metadata?.buildPack ?? 'nixpacks'),
					githubConnectionId:
						typeof row.metadata?.githubConnectionId === 'string'
							? row.metadata.githubConnectionId
							: null,
					domains: domains.filter(
						(domain) => domain.applicationBuildId === row.id,
					),
					databases: bindings.filter(
						(binding) => binding.applicationBuildId === row.id,
					),
					latestDeployment,
				};
				}),
			);
		} catch {
			return resp.failure(
				'Workspace not found.',
				resp.codes.RESOURCE_NOT_FOUND,
				undefined,
				null,
				undefined,
				404,
			);
		}
	}

	/** Update an owned application's deployable configuration and queue a fresh deployment. */
	public static async update(
		request: Request,
		workspacePublicId: number,
		applicationId: string,
		input: UpdateApplicationRequest,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await access(request, workspacePublicId, metadata);
			if (input.autoDeployEnabled === true) {
				const autoPolicy = await effectiveEntitlement(
					workspace.id,
					'deployments.auto_enabled',
				);
				if (autoPolicy.booleanValue !== true)
					return resp.failure(
						'Automatic deployments are not included in this package.',
						resp.codes.ORDER_CANNOT_BE_PROCESSED,
						undefined,
						null,
						undefined,
						422,
					);
			}
			const [application] = await db
				.select()
				.from(applicationBuilds)
				.where(
					and(
						eq(applicationBuilds.id, applicationId),
						eq(applicationBuilds.workspaceId, workspace.id),
						isNull(applicationBuilds.deletedAt),
					),
				)
				.limit(1);
			if (!application)
				return resp.failure(
					'Application not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			const [runtime] = await db
				.select({ language: runtimeImages.language })
				.from(runtimeImages)
				.where(
					and(
						eq(runtimeImages.id, application.runtimeImageId),
						isNull(runtimeImages.deletedAt),
					),
				)
				.limit(1);
			if (!runtime)
				return resp.failure(
					'Application runtime is unavailable.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			const frameworkCode =
				input.framework === undefined ? application.framework : input.framework;
			const selectedFramework = frameworkDefinition(frameworkCode);
			if (frameworkCode && !selectedFramework)
				return resp.failure(
					'Framework is unsupported.',
					resp.codes.INVALID_INPUT_DATA,
					undefined,
					null,
					undefined,
					422,
				);
			if (selectedFramework && selectedFramework.language !== runtime.language)
				return resp.failure(
					'Framework does not match the selected runtime.',
					resp.codes.INVALID_INPUT_DATA,
					undefined,
					null,
					undefined,
					422,
				);
			const deploymentContract = resolveDeploymentContract({
				buildCommand: input.buildCommand,
				framework: frameworkCode,
				installCommand: input.installCommand,
				port: input.port,
				projectDirectory: input.baseDirectory,
				publishDirectory: input.publishDirectory,
				stack: runtime.language,
				startCommand: input.startCommand,
			});
			const contractErrors = deploymentContract.checks.filter(
				({ status }) => status === 'error',
			);
			if (contractErrors.length)
				return resp.failure(
					'Deployment configuration did not pass preflight.',
					resp.codes.VALIDATION_ERROR,
					contractErrors.map(({ code, message }) => ({
						field: code,
						message,
					})),
					null,
					undefined,
					400,
				);
			const now = new Date();
			const deploymentRetention = await effectiveEntitlement(
				workspace.id,
				'deployments.retention_days',
			);
			const deploymentExpiresAt = deploymentRetention.isUnlimited
				? null
				: new Date(
						Date.now() +
							Math.max(1, deploymentRetention.limit || 7) * 86_400_000,
					);
			const result = await db.transaction(async (transaction) => {
				await transaction
					.update(applicationBuilds)
					.set({
						metadata: {
							...application.metadata,
							...(input.name ? { name: input.name } : {}),
							deploymentContract,
						},
						sourceRef: input.branch,
						deploymentEnvironment:
							input.deploymentEnvironment ?? application.deploymentEnvironment,
						framework: frameworkCode,
						autoDeployEnabled:
							input.autoDeployEnabled ?? application.autoDeployEnabled,
						visibility: input.visibility ?? application.visibility,
						installCommand: deploymentContract.installCommand,
						buildCommand: deploymentContract.buildCommand,
						startCommand: deploymentContract.startCommand,
						baseDirectory: input.baseDirectory,
						publishDirectory: deploymentContract.publishDirectory,
						applicationPort: input.port,
						status: 'queued',
						completedAt: null,
						failureReason: null,
						updatedAt: now,
					})
					.where(eq(applicationBuilds.id, applicationId));
				const [deployment] = await transaction
					.insert(applicationDeployments)
					.values({
						workspaceId: workspace.id,
						applicationBuildId: applicationId,
						expiresAt: deploymentExpiresAt,
					})
					.returning({ id: applicationDeployments.id });
				const [job] = await transaction
					.insert(provisioningJobs)
					.values({
						workspaceId: workspace.id,
						subscriptionId: workspace.subscriptionId,
						provider:
							process.env.HOSTING_PROVIDER === 'coolify' ? 'coolify' : 'mock',
						idempotencyKey: `application:${applicationId}:update:${randomUUID()}`,
						input: {
							applicationBuildId: applicationId,
							deploymentId: deployment?.id,
						},
					})
					.returning({ id: provisioningJobs.id });
				return { deploymentId: deployment?.id, jobId: job?.id };
			});
			if (
				application.resourceId &&
				(input.autoDeployEnabled !== undefined ||
					input.visibility !== undefined)
			) {
				const [resource] = await db
					.select({ providerId: workspaceResources.providerResourceId })
					.from(workspaceResources)
					.where(
						and(
							eq(workspaceResources.id, application.resourceId),
							isNull(workspaceResources.deletedAt),
						),
					)
					.limit(1);
				if (resource) {
					const provider = await hostingProvider();
					await provider.updateApplicationSettings(resource.providerId, {
						autoDeployEnabled: input.autoDeployEnabled,
					});
					if (input.visibility) {
						const enabledDomains =
							input.visibility === 'private'
								? []
								: (
										await db
											.select({ hostname: applicationDomains.hostname })
											.from(applicationDomains)
											.where(
												and(
													eq(
														applicationDomains.applicationBuildId,
														application.id,
													),
													eq(applicationDomains.isEnabled, true),
													isNull(applicationDomains.deletedAt),
												),
											)
									).map(({ hostname }) => hostname);
						await provider.updateApplicationDomains(
							resource.providerId,
							enabledDomains,
						);
					}
				}
			}
			await recordAuditLog({
				actorUserId: workspace.actorUserId,
				action: 'application.configuration_updated',
				resourceType: 'application_build',
				resourceId: applicationId,
				metadata: { workspacePublicId },
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			void processProvisioningJobs(10).catch((error: unknown) =>
				console.error('Immediate application provisioning failed.', error),
			);
			return resp.success(
				'Application updated and deployment queued.',
				result,
				resp.codes.ACCEPTED,
				undefined,
				202,
			);
		} catch (error) {
			return resp.failure(
				error instanceof Error ? error.message : 'Application update failed.',
				resp.codes.INTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				500,
			);
		}
	}

	/** Returns package-limited deployment history, retaining provider logs locally when available. */
	public static async deployments(
		request: Request,
		workspacePublicId: number,
		applicationId: string,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await access(request, workspacePublicId, metadata);
			const [application] = await db
				.select({ resourceId: applicationBuilds.resourceId })
				.from(applicationBuilds)
				.where(
					and(
						eq(applicationBuilds.id, applicationId),
						eq(applicationBuilds.workspaceId, workspace.id),
						isNull(applicationBuilds.deletedAt),
					),
				)
				.limit(1);
			if (!application)
				return resp.failure(
					'Application not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			const [limitPolicy, retentionPolicy] = await Promise.all([
				effectiveEntitlement(workspace.id, 'deployments.history_limit'),
				effectiveEntitlement(workspace.id, 'deployments.retention_days'),
			]);
			const limit = limitPolicy.isUnlimited
				? 100
				: Math.max(1, limitPolicy.limit || 2);
			const retentionDays = retentionPolicy.isUnlimited
				? null
				: Math.max(1, retentionPolicy.limit || 7);
			const retentionCutoff =
				retentionDays === null
					? null
					: new Date(Date.now() - retentionDays * 86_400_000);
			await db
				.update(applicationDeployments)
				.set({
					deletedAt: new Date(),
					deleteReason: 'Package deployment-history retention elapsed.',
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(applicationDeployments.applicationBuildId, applicationId),
						isNull(applicationDeployments.deletedAt),
						sql`${applicationDeployments.expiresAt} IS NOT NULL AND ${applicationDeployments.expiresAt} <= now()`,
					),
				);
			let providerRows: readonly import('@services/hosting/HostingProvider').ProviderDeployment[] =
				[];
			if (application.resourceId) {
				const [resource] = await db
					.select({ providerId: workspaceResources.providerResourceId })
					.from(workspaceResources)
					.where(
						and(
							eq(workspaceResources.id, application.resourceId),
							isNull(workspaceResources.deletedAt),
						),
					)
					.limit(1);
				if (resource)
					providerRows = await (
						await hostingProvider()
					).listApplicationDeployments(resource.providerId, limit);
			}
			const localRows = await db
				.select()
				.from(applicationDeployments)
				.where(
					and(
						eq(applicationDeployments.applicationBuildId, applicationId),
						isNull(applicationDeployments.deletedAt),
					),
				)
				.orderBy(desc(applicationDeployments.createdAt))
				.limit(limit);
			const retainedProviderRows = providerRows
				.filter(
					(row) =>
						!retentionCutoff ||
						!row.createdAt ||
						new Date(row.createdAt) >= retentionCutoff,
				)
				.slice(0, limit);
			const provider = retainedProviderRows.length
				? await hostingProvider()
				: null;
			let logsPermissionRequired = false;
			const detailedProviderRows = provider
				? await Promise.all(
						retainedProviderRows.map(async (row) => {
							if (row.logs) return row;
							try {
								return {
									...row,
									...(await provider.getApplicationDeployment(row.id)),
								};
							} catch (error) {
								if (
									error instanceof Error &&
									/^Coolify 403:/i.test(error.message)
								)
									logsPermissionRequired = true;
								return row;
							}
						}),
					)
				: retainedProviderRows;
			await recordAuditLog({
				actorUserId: workspace.actorUserId,
				action: 'application.deployment_history_viewed',
				resourceType: 'application_build',
				resourceId: applicationId,
				metadata: {
					workspacePublicId,
					returnedCount: retainedProviderRows.length || localRows.length,
				},
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success('Deployment history retrieved.', {
			items: detailedProviderRows.length
				? detailedProviderRows
				: localRows.map((row) => {
						const logs = row.logsCiphertext
							? decryptCredential(row.logsCiphertext)
							: null;
						return {
							...row,
							id: row.providerDeploymentId ?? row.id,
							diagnostic: diagnoseDeploymentLogs(logs),
							logs,
							logSections: parseDeploymentLogs(logs),
						};
					}),
				limit: limitPolicy.isUnlimited ? null : limit,
				retentionDays,
				totalRetained: localRows.length,
				logsPermissionRequired,
				logsUnavailable:
					!logsPermissionRequired &&
					detailedProviderRows.some((row) => !row.logs),
			});
		} catch (error) {
			return resp.failure(
				error instanceof Error
					? error.message
					: 'Deployment history unavailable.',
				resp.codes.EXTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				502,
			);
		}
	}

	/** Streams provider-backed application events after workspace authorization. */
	public static async events(
		request: Request,
		workspacePublicId: number,
		applicationId: string,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await access(request, workspacePublicId, metadata);
			const [application] = await db
				.select({
					id: applicationBuilds.id,
					providerId: workspaceResources.providerResourceId,
				})
				.from(applicationBuilds)
				.innerJoin(
					workspaceResources,
					and(
						eq(workspaceResources.id, applicationBuilds.resourceId),
						isNull(workspaceResources.deletedAt),
					),
				)
				.where(
					and(
						eq(applicationBuilds.id, applicationId),
						eq(applicationBuilds.workspaceId, workspace.id),
						isNull(applicationBuilds.deletedAt),
					),
				)
				.limit(1);
			if (!application)
				return resp.failure(
					'Application not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			const encoder = new TextEncoder();
			let cleanup = (): void => undefined;
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					const keepAlive = setInterval(
						() => controller.enqueue(encoder.encode(': keep-alive\n\n')),
						15_000,
					);
					const unsubscribe = subscribeApplicationEvents(
						application.id,
						application.providerId,
						(event) =>
							controller.enqueue(
								encoder.encode(
									`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
								),
							),
					);
					cleanup = () => {
						clearInterval(keepAlive);
						unsubscribe();
						try {
							controller.close();
						} catch {
							/* Stream already closed. */
						}
					};
					request.signal.addEventListener('abort', cleanup, { once: true });
				},
				cancel() {
					cleanup();
				},
			});
			return new Response(stream, {
				headers: {
					'cache-control': 'no-cache, no-transform',
					connection: 'keep-alive',
					'content-type': 'text/event-stream',
					'x-accel-buffering': 'no',
				},
			});
		} catch (error) {
			return resp.failure(
				error instanceof Error
					? error.message
					: 'Application event stream unavailable.',
				resp.codes.AUTHORIZATION_ERROR,
				undefined,
				null,
				undefined,
				403,
			);
		}
	}

	/** Applies a customer-authorized lifecycle transition to the provider resource. */
	public static async control(
		request: Request,
		workspacePublicId: number,
		applicationId: string,
		input: ApplicationActionRequest,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await access(request, workspacePublicId, metadata);
			const [application] = await db
				.select({
					id: applicationBuilds.id,
					name: applicationBuilds.metadata,
					operationalStatus: applicationBuilds.operationalStatus,
					resourceId: workspaceResources.id,
					providerId: workspaceResources.providerResourceId,
				})
				.from(applicationBuilds)
				.innerJoin(
					workspaceResources,
					and(
						eq(workspaceResources.id, applicationBuilds.resourceId),
						isNull(workspaceResources.deletedAt),
					),
				)
				.where(
					and(
						eq(applicationBuilds.id, applicationId),
						eq(applicationBuilds.workspaceId, workspace.id),
						isNull(applicationBuilds.deletedAt),
					),
				)
				.limit(1);
			if (!application)
				return resp.failure(
					'Application not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			if (application.operationalStatus === 'suspended')
				return resp.failure(
					'This application is suspended by an administrator.',
					resp.codes.PERMISSION_DENIED,
					undefined,
					null,
					undefined,
					403,
				);
			const manualPolicy = await effectiveEntitlement(
				workspace.id,
				'deployments.manual_enabled',
			);
			if (manualPolicy.booleanValue === false)
				return resp.failure(
					'Manual deployments are not included in this package.',
					resp.codes.ORDER_CANNOT_BE_PROCESSED,
					undefined,
					null,
					undefined,
					422,
				);
			const providerAction =
				input.action === 'deactivate'
					? 'stop'
					: input.action === 'reactivate'
						? 'start'
						: input.action;
			const result = await (
				await hostingProvider()
			).controlApplication(application.providerId, providerAction);
			if (providerAction !== 'stop') {
				publishApplicationEvent({
					applicationId: application.id,
					deploymentId: result.deploymentId,
					deploymentStatus: 'queued',
					providerStatus: 'provisioning',
					type: 'deployment',
				});
				ensureApplicationTracker(application.id, application.providerId);
			}
			const operationalStatus =
				input.action === 'stop'
					? 'paused'
					: input.action === 'deactivate'
						? 'deactivated'
						: 'active';
			await db
				.update(applicationBuilds)
				.set({ operationalStatus, updatedAt: new Date() })
				.where(eq(applicationBuilds.id, application.id));
			await db
				.update(workspaceResources)
				.set({
					status: providerAction === 'stop' ? 'stopped' : 'provisioning',
					providerDeploymentId: result.deploymentId ?? undefined,
					updatedAt: new Date(),
				})
				.where(eq(workspaceResources.id, application.resourceId));
			if (providerAction !== 'stop') {
				const retention = await effectiveEntitlement(
					workspace.id,
					'deployments.retention_days',
				);
				await db.insert(applicationDeployments).values({
					workspaceId: workspace.id,
					applicationBuildId: application.id,
					resourceId: application.resourceId,
					providerDeploymentId: result.deploymentId,
					status: 'queued',
					trigger: 'manual',
					expiresAt: retention.isUnlimited
						? null
						: new Date(
								Date.now() + Math.max(1, retention.limit || 7) * 86_400_000,
							),
					metadata: { action: input.action },
				});
			}
			await recordAuditLog({
				actorUserId: workspace.actorUserId,
				action: `application.${input.action}`,
				resourceType: 'application_build',
				resourceId: application.id,
				metadata: {
					workspacePublicId,
					reason: input.reason,
					providerDeploymentId: result.deploymentId,
				},
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			return resp.success(
				`Application ${input.action} requested.`,
				result,
				resp.codes.ACCEPTED,
				undefined,
				202,
			);
		} catch (error) {
			return resp.failure(
				error instanceof Error ? error.message : 'Application action failed.',
				resp.codes.EXTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				502,
			);
		}
	}

	/** Deletes an application and optionally its exclusively connected databases. */
	public static async destroy(
		request: Request,
		workspacePublicId: number,
		applicationId: string,
		input: DeleteApplicationRequest,
		metadata: RequestMetadata,
	): Promise<Response> {
		const workspace = await access(request, workspacePublicId, metadata);
		const [application] = await db
			.select({
				id: applicationBuilds.id,
				metadata: applicationBuilds.metadata,
				resourceId: workspaceResources.id,
				providerId: workspaceResources.providerResourceId,
			})
			.from(applicationBuilds)
			.leftJoin(
				workspaceResources,
				and(
					eq(workspaceResources.id, applicationBuilds.resourceId),
					isNull(workspaceResources.deletedAt),
				),
			)
			.where(
				and(
					eq(applicationBuilds.id, applicationId),
					eq(applicationBuilds.workspaceId, workspace.id),
					isNull(applicationBuilds.deletedAt),
				),
			)
			.limit(1);
		if (!application)
			return resp.failure(
				'Application not found.',
				resp.codes.RESOURCE_NOT_FOUND,
				undefined,
				null,
				undefined,
				404,
			);
		const name = String(application.metadata?.name ?? 'Application');
		if (input.confirmationName !== name)
			return resp.failure(
				'Application name confirmation does not match.',
				resp.codes.ORDER_CANNOT_BE_PROCESSED,
				undefined,
				null,
				undefined,
				422,
			);
		for (const database of input.databases) {
			const response = await LogicalDatabaseController.destroy(
				request,
				workspacePublicId,
				database.id,
				{
					acceptedImpact: true,
					confirmationName: database.confirmationName,
					connectedApplicationNames: [name],
				},
				metadata,
			);
			if (!response.ok) return response;
		}
		await db
			.update(applicationBuilds)
			.set({ operationalStatus: 'deleting', updatedAt: new Date() })
			.where(eq(applicationBuilds.id, application.id));
		try {
			if (application.providerId)
				await (await hostingProvider()).deleteApplication(application.providerId);
		} catch (error) {
			await db
				.update(applicationBuilds)
				.set({
					operationalStatus: 'cleanup_failed',
					failureReason:
						error instanceof Error ? error.message : 'Provider cleanup failed.',
					updatedAt: new Date(),
				})
				.where(eq(applicationBuilds.id, application.id));
			return resp.failure(
				error instanceof Error ? error.message : 'Provider cleanup failed.',
				resp.codes.EXTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				502,
			);
		}
		const now = new Date();
		await db.transaction(async (transaction) => {
			await transaction
				.update(applicationDomains)
				.set({
					deletedAt: now,
					deleteReason: 'Application deleted.',
					updatedAt: now,
				})
				.where(
					and(
						eq(applicationDomains.applicationBuildId, application.id),
						isNull(applicationDomains.deletedAt),
					),
				);
			await transaction
				.update(applicationDatabaseBindings)
				.set({
					deletedAt: now,
					deleteReason: 'Application deleted.',
					updatedAt: now,
				})
				.where(
					and(
						eq(applicationDatabaseBindings.applicationBuildId, application.id),
						isNull(applicationDatabaseBindings.deletedAt),
					),
				);
			await transaction
				.update(applicationBuilds)
				.set({
					deletedAt: now,
					deleteReason: 'Deleted by workspace user.',
					updatedAt: now,
				})
				.where(eq(applicationBuilds.id, application.id));
			if (application.resourceId)
				await transaction
					.update(workspaceResources)
					.set({
						deletedAt: now,
						deleteReason: 'Application deleted by workspace user.',
						status: 'stopped',
						updatedAt: now,
					})
					.where(eq(workspaceResources.id, application.resourceId));
		});
		await recordAuditLog({
			actorUserId: workspace.actorUserId,
			action: 'application.deleted',
			resourceType: 'application_build',
			resourceId: application.id,
			metadata: {
				workspacePublicId,
				deletedDatabaseIds: input.databases.map(({ id }) => id),
			},
			ipAddress: metadata.ipAddress,
			userAgent: metadata.userAgent,
		});
		return resp.success(
			'Application deleted.',
			{ id: application.id },
			resp.codes.UPDATED,
		);
	}
	public static async create(
		request: Request,
		workspacePublicId: number,
		input: CreateApplicationRequest,
		metadata: RequestMetadata,
	): Promise<Response> {
		let reservationId: string | undefined;
		let domainReservationId: string | undefined;
		try {
			const workspace = await access(request, workspacePublicId, metadata);
			if (input.autoDeployEnabled) {
				const autoPolicy = await effectiveEntitlement(
					workspace.id,
					'deployments.auto_enabled',
				);
				if (autoPolicy.booleanValue !== true)
					return resp.failure(
						'Automatic deployments are not included in this package.',
						resp.codes.ORDER_CANNOT_BE_PROCESSED,
						undefined,
						null,
						undefined,
						422,
					);
			}
			const [{ used }] = await db
				.select({ used: count() })
				.from(applicationBuilds)
				.where(
					and(
						eq(applicationBuilds.workspaceId, workspace.id),
						isNull(applicationBuilds.deletedAt),
					),
				);
			const [runtime] = await db
				.select()
				.from(runtimeImages)
				.where(
					and(
						eq(runtimeImages.code, input.runtimeCode),
						eq(runtimeImages.status, 'active'),
						isNull(runtimeImages.deletedAt),
					),
				)
				.limit(1);
			if (!runtime)
				return resp.failure(
					'Runtime is unavailable.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			const selectedFramework = frameworkDefinition(input.framework);
			if (input.framework && !selectedFramework)
				return resp.failure(
					'Framework is unsupported.',
					resp.codes.INVALID_INPUT_DATA,
					undefined,
					null,
					undefined,
					422,
				);
			if (selectedFramework && selectedFramework.language !== runtime.language)
				return resp.failure(
					'Framework does not match the selected runtime.',
					resp.codes.INVALID_INPUT_DATA,
					undefined,
					null,
					undefined,
					422,
				);
			const deploymentContract = resolveDeploymentContract({
				buildCommand: input.buildCommand,
				framework: input.framework,
				installCommand: input.installCommand,
				port: input.port,
				projectDirectory: input.baseDirectory,
				publishDirectory: input.publishDirectory,
				stack: runtime.language,
				startCommand: input.startCommand,
			});
			const contractErrors = deploymentContract.checks.filter(
				({ status }) => status === 'error',
			);
			if (contractErrors.length)
				return resp.failure(
					'Deployment configuration did not pass preflight.',
					resp.codes.VALIDATION_ERROR,
					contractErrors.map(({ code, message }) => ({
						field: code,
						message,
					})),
					null,
					undefined,
					400,
				);
			let githubConnection:
				typeof workspaceGithubConnections.$inferSelect | undefined;
			if (input.githubConnectionId) {
				[githubConnection] = await db
					.select()
					.from(workspaceGithubConnections)
					.where(
						and(
							eq(workspaceGithubConnections.id, input.githubConnectionId),
							eq(workspaceGithubConnections.workspaceId, workspace.id),
							eq(workspaceGithubConnections.status, 'active'),
							isNull(workspaceGithubConnections.deletedAt),
						),
					)
					.limit(1);
				if (!githubConnection)
					return resp.failure(
						'GitHub connection not found.',
						resp.codes.RESOURCE_NOT_FOUND,
						undefined,
						null,
						undefined,
						404,
					);
				if (
					githubConnection.providerSyncStatus !== 'ready' ||
					!githubConnection.coolifyGithubAppUuid
				)
					return resp.failure(
						'GitHub is connected, but its deployment provider setup is not ready.',
						resp.codes.ORDER_CANNOT_BE_PROCESSED,
						undefined,
						{ providerSyncStatus: githubConnection.providerSyncStatus },
						undefined,
						422,
					);
				const allowedRepositories = await githubInstallationRepositories(
					githubConnection.installationId,
				);
				if (
					!allowedRepositories.some(
						(repository) =>
							repository.url.replace(/\.git$/, '') ===
							input.repository.replace(/\.git$/, ''),
					)
				)
					return resp.failure(
						'The connected GitHub App cannot access this repository.',
						resp.codes.PERMISSION_DENIED,
						undefined,
						null,
						undefined,
						403,
					);
			}
			const uniquePrefixes = new Set(
				input.databases.map((item) => item.environmentPrefix),
			);
			if (uniquePrefixes.size !== input.databases.length)
				return resp.failure(
					'Database environment prefixes must be unique.',
					resp.codes.VALIDATION_ERROR,
					undefined,
					null,
					undefined,
					400,
				);
			if (input.databases.length) {
				const selected = await db
					.select({ id: logicalDatabases.id, engine: databaseClusters.engine })
					.from(logicalDatabases)
					.innerJoin(
						databaseClusters,
						eq(databaseClusters.id, logicalDatabases.clusterId),
					)
					.where(
						and(
							eq(logicalDatabases.workspaceId, workspace.id),
							eq(logicalDatabases.status, 'active'),
							isNull(logicalDatabases.deletedAt),
						),
					);
				const allowed = new Set(selected.map(({ id }) => id));
				if (input.databases.some(({ databaseId }) => !allowed.has(databaseId)))
					return resp.failure(
						'A selected database is unavailable.',
						resp.codes.RESOURCE_NOT_FOUND,
						undefined,
						null,
						undefined,
						404,
					);
				if (
					selectedFramework &&
					selected.some(
						({ id, engine }) =>
							input.databases.some(({ databaseId }) => databaseId === id) &&
							!selectedFramework.databaseEngines.includes(engine),
					)
				)
					return resp.failure(
						'Selected database engine is incompatible with the framework.',
						resp.codes.INVALID_INPUT_DATA,
						undefined,
						null,
						undefined,
						422,
					);
			}
			const customHostnames = [
				...new Set([...(input.domain ? [input.domain] : []), ...input.domains]),
			];
			const verificationRequired = await ownershipVerificationEnabled();
			const domainPolicies = await Promise.all(
				customHostnames.map(async (hostname) => ({
					hostname,
					ownership:
						(await controllingOwnership(hostname)) ??
						(await workspaceOwnershipClaim(workspace.id, hostname)),
				})),
			);
			if (customHostnames.length) {
				const conflicts = await db
					.select({ id: applicationBuilds.id })
					.from(applicationDomains)
					.innerJoin(
						applicationBuilds,
						eq(applicationBuilds.id, applicationDomains.applicationBuildId),
					)
					.where(
						and(
							inArray(applicationDomains.hostname, customHostnames),
							isNull(applicationDomains.deletedAt),
						),
					);
				if (conflicts.length)
					return resp.failure(
						'Domain is already assigned.',
						resp.codes.RESOURCE_ALREADY_EXISTS,
						undefined,
						null,
						undefined,
						409,
					);
			}
			const reservation = await reserveWorkspaceUsage({
				workspaceId: workspace.id,
				code: 'applications.count',
				current: Number(used),
				quantity: 1,
				idempotencyKey: `application-create:${randomUUID()}`,
			});
			reservationId = reservation.reservationId;
			if (!reservation.allowed || !reservationId)
				return resp.failure(
					'Workspace application limit reached.',
					resp.codes.ORDER_CANNOT_BE_PROCESSED,
					undefined,
					{ quota: reservation },
					undefined,
					422,
				);
			const platform = await getEffectivePlatformUrls();
			const readableSubdomain = (input.subdomain ?? input.name)
				.toLowerCase()
				.replace(/[^a-z0-9-]+/g, '-')
				.replace(/^-|-$/g, '')
				.slice(0, 50);
			const forbidden = [
				...platform.reservedDomainLabels,
				...platform.blockedDomainKeywords,
			].find(
				(keyword) =>
					readableSubdomain === keyword ||
					(platform.blockedDomainKeywords.includes(keyword) &&
						readableSubdomain.includes(keyword)),
			);
			if (forbidden) {
				await releaseUsageReservation(
					reservationId,
					'Default domain label violates platform policy.',
				);
				return resp.failure(
					'Choose another default domain label.',
					resp.codes.INVALID_INPUT_DATA,
					undefined,
					null,
					undefined,
					422,
				);
			}
			const subdomain = `${readableSubdomain}-${
				input.subdomainSuffix ??
				randomBytes(4)
					.toString('base64url')
					.toLowerCase()
					.replace(/[^a-z0-9]/g, '')
					.slice(0, 6)
					.padEnd(6, '0')
			}`;
			const platformHostname = `${subdomain}.${platform.applicationBaseDomain}`;
			if (customHostnames.includes(platformHostname)) {
				await releaseUsageReservation(
					reservationId,
					'Custom domain duplicated the platform subdomain.',
				);
				return resp.failure(
					'A custom domain cannot duplicate the platform subdomain.',
					resp.codes.RESOURCE_ALREADY_EXISTS,
					undefined,
					null,
					undefined,
					409,
				);
			}
			const [hostnameConflict] = await db
				.select({ id: applicationDomains.id })
				.from(applicationDomains)
				.where(
					and(
						eq(applicationDomains.hostname, platformHostname),
						isNull(applicationDomains.deletedAt),
					),
				)
				.limit(1);
			if (hostnameConflict) {
				await releaseUsageReservation(
					reservationId,
					'Application subdomain is already assigned.',
				);
				return resp.failure(
					'Application subdomain is already assigned.',
					resp.codes.RESOURCE_ALREADY_EXISTS,
					undefined,
					null,
					undefined,
					409,
				);
			}
			if (customHostnames.length) {
				const [{ usedDomains }] = await db
					.select({ usedDomains: count() })
					.from(applicationDomains)
					.innerJoin(
						applicationBuilds,
						eq(applicationBuilds.id, applicationDomains.applicationBuildId),
					)
					.where(
						and(
							eq(applicationBuilds.workspaceId, workspace.id),
							eq(applicationDomains.type, 'custom'),
							isNull(applicationDomains.deletedAt),
							isNull(applicationBuilds.deletedAt),
						),
					);
				const domainReservation = await reserveWorkspaceUsage({
					workspaceId: workspace.id,
					code: 'domains.count',
					current: Number(usedDomains),
					quantity: customHostnames.length,
					idempotencyKey: `application-domains:${randomUUID()}`,
				});
				domainReservationId = domainReservation.reservationId;
				if (!domainReservation.allowed || !domainReservationId) {
					await releaseUsageReservation(
						reservationId,
						'Workspace custom-domain limit reached.',
					);
					return resp.failure(
						'Workspace custom-domain limit reached.',
						resp.codes.ORDER_CANNOT_BE_PROCESSED,
						undefined,
						{ quota: domainReservation },
						undefined,
						422,
					);
				}
			}
			const deploymentRetention = await effectiveEntitlement(
				workspace.id,
				'deployments.retention_days',
			);
			const deploymentExpiresAt = deploymentRetention.isUnlimited
				? null
				: new Date(
						Date.now() +
							Math.max(1, deploymentRetention.limit || 7) * 86_400_000,
					);
			const result = await db.transaction(async (transaction) => {
				const [build] = await transaction
					.insert(applicationBuilds)
					.values({
						workspaceId: workspace.id,
						runtimeImageId: runtime.id,
						status: 'queued',
						deploymentEnvironment: input.deploymentEnvironment,
						framework: input.framework || null,
						environmentVariablesCiphertext: input.environmentVariables.length
							? encryptCredential(JSON.stringify(input.environmentVariables))
							: null,
						sourceRepository: input.repository,
						sourceRef: input.branch,
						installCommand: deploymentContract.installCommand,
						buildCommand: deploymentContract.buildCommand,
						startCommand: deploymentContract.startCommand,
						baseDirectory: input.baseDirectory,
						publishDirectory: deploymentContract.publishDirectory,
						applicationPort: input.port,
						requestedDomain: customHostnames[0],
						metadata: {
							name: input.name,
							buildPack: input.buildPack,
							defaultDomainLabel: readableSubdomain,
							githubConnectionId: githubConnection?.id,
							githubInstallationId: githubConnection?.installationId,
							coolifyGithubAppUuid: githubConnection?.coolifyGithubAppUuid,
							deploymentContract,
						},
						autoDeployEnabled: input.autoDeployEnabled,
					})
					.returning({ id: applicationBuilds.id });
				if (!build) throw new Error('Unable to persist application.');
				const domainRows = await transaction
					.insert(applicationDomains)
					.values([
						{
							applicationBuildId: build.id,
							hostname: platformHostname,
							type: 'platform',
							status: platform.applicationDomainReady ? 'verified' : 'pending',
							isPrimary: true,
							isEnabled: true,
							verifiedAt: platform.applicationDomainReady ? new Date() : null,
						},
						...domainPolicies.map(({ hostname, ownership }) => {
							const owned =
								ownership?.workspaceId === workspace.id &&
								ownership.status === 'verified';
							const direct = owned || (!ownership && !verificationRequired);
							return {
								applicationBuildId: build.id,
								hostname,
								type: 'custom' as const,
								status: direct ? ('verified' as const) : ('pending' as const),
								isPrimary: false,
								isEnabled: direct,
								verifiedAt: direct ? new Date() : null,
								tlsStatus: direct
									? ('provisioning' as const)
									: ('pending' as const),
								verificationToken: ownership
									? null
									: verificationRequired
										? randomUUID()
										: null,
							};
						}),
					])
					.returning({
						id: applicationDomains.id,
						hostname: applicationDomains.hostname,
						verificationToken: applicationDomains.verificationToken,
					});
				for (const policy of domainPolicies) {
					const domain = domainRows.find(
						(row) => row.hostname === policy.hostname,
					);
					if (!domain) throw new Error('Unable to persist custom domain.');
					if (!policy.ownership) {
						await transaction.insert(domainOwnerships).values({
							workspaceId: workspace.id,
							hostname: policy.hostname,
							status: verificationRequired ? 'pending' : 'verified',
							verificationToken: domain.verificationToken,
							verificationMethod: verificationRequired
								? 'dns_txt'
								: 'platform_bypass',
							verifiedAt: verificationRequired ? null : new Date(),
						});
					} else if (policy.ownership.workspaceId !== workspace.id) {
						await transaction.insert(domainAccessRequests).values({
							ownershipId: policy.ownership.id,
							requestingWorkspaceId: workspace.id,
							applicationBuildId: build.id,
							applicationDomainId: domain.id,
							hostname: policy.hostname,
						});
					}
				}
				if (input.databases.length)
					await transaction.insert(applicationDatabaseBindings).values(
						input.databases.map((item) => ({
							applicationBuildId: build.id,
							logicalDatabaseId: item.databaseId,
							environmentPrefix: item.environmentPrefix,
						})),
					);
				const [deployment] = await transaction
					.insert(applicationDeployments)
					.values({
						workspaceId: workspace.id,
						applicationBuildId: build.id,
						expiresAt: deploymentExpiresAt,
					})
					.returning({ id: applicationDeployments.id });
				const [job] = await transaction
					.insert(provisioningJobs)
					.values({
						workspaceId: workspace.id,
						subscriptionId: workspace.subscriptionId,
						provider:
							process.env.HOSTING_PROVIDER === 'coolify' ? 'coolify' : 'mock',
						idempotencyKey: `application:${build.id}:deploy`,
						input: {
							applicationBuildId: build.id,
							deploymentId: deployment?.id,
						},
					})
					.returning({ id: provisioningJobs.id });
				return { id: build.id, deploymentId: deployment?.id, jobId: job?.id };
			});
			await commitUsageReservation(
				reservationId,
				'application_build',
				result.id,
			);
			if (domainReservationId)
				await commitUsageReservation(
					domainReservationId,
					'application_build',
					result.id,
				);
			await recordAuditLog({
				actorUserId: workspace.actorUserId,
				action: 'application.deployment_queued',
				resourceType: 'application_build',
				resourceId: result.id,
				metadata: {
					workspacePublicId,
					runtimeCode: input.runtimeCode,
					databaseCount: input.databases.length,
					domainCount: customHostnames.length,
				},
				ipAddress: metadata.ipAddress,
				userAgent: metadata.userAgent,
			});
			void processProvisioningJobs(10).catch((error: unknown) =>
				console.error('Immediate application provisioning failed.', error),
			);
			return resp.success(
				'Application deployment queued.',
				result,
				resp.codes.ACCEPTED,
				undefined,
				202,
			);
		} catch (error) {
			if (reservationId)
				await releaseUsageReservation(
					reservationId,
					error instanceof Error
						? error.message
						: 'Application creation failed.',
				);
			if (domainReservationId)
				await releaseUsageReservation(
					domainReservationId,
					error instanceof Error
						? error.message
						: 'Application creation failed.',
				);
			return resp.failure(
				error instanceof Error ? error.message : 'Application creation failed.',
				resp.codes.INTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				500,
			);
		}
	}
	public static async logs(
		request: Request,
		workspacePublicId: number,
		applicationId: string,
		metadata: RequestMetadata,
	): Promise<Response> {
		try {
			const workspace = await access(request, workspacePublicId, metadata);
			const [record] = await db
				.select({ providerResourceId: workspaceResources.providerResourceId })
				.from(applicationBuilds)
				.innerJoin(
					workspaceResources,
					eq(workspaceResources.id, applicationBuilds.resourceId),
				)
				.where(
					and(
						eq(applicationBuilds.id, applicationId),
						eq(applicationBuilds.workspaceId, workspace.id),
						isNull(applicationBuilds.deletedAt),
					),
				)
				.limit(1);
			if (!record)
				return resp.failure(
					'Application not found.',
					resp.codes.RESOURCE_NOT_FOUND,
					undefined,
					null,
					undefined,
					404,
				);
			const provider = await hostingProvider();
			try {
				const logs = await provider.getApplicationLogs(
					record.providerResourceId,
					200,
				);
				await recordAuditLog({
					actorUserId: workspace.actorUserId,
					action: 'application.logs_viewed',
					resourceType: 'application_build',
					resourceId: applicationId,
					metadata: { workspacePublicId, source: 'runtime' },
					ipAddress: metadata.ipAddress,
					userAgent: metadata.userAgent,
				});
				return resp.success('Runtime logs retrieved.', {
					logs,
					source: 'runtime',
				});
			} catch {
				const [summary] = await provider.listApplicationDeployments(
					record.providerResourceId,
					1,
				);
				if (!summary)
					return resp.success('Waiting for the first provider deployment.', {
						logs: '',
						source: 'deployment',
						waiting: true,
					});
				let deployment = summary;
				if (!deployment.logs) {
					try {
						deployment = {
							...deployment,
							...(await provider.getApplicationDeployment(deployment.id)),
						};
					} catch {
						/* Retain the provider summary when detail access is unavailable. */
					}
				}
				if (!deployment.logs)
					return resp.success(
						'Deployment metadata is available, but Coolify did not return build logs.',
						{
							logs: '',
							source: 'deployment',
							logsPermissionRequired: true,
							waiting: /queued|progress|building|starting/i.test(
								deployment.status,
							),
						},
					);
				const [local] = await db
					.select({ id: applicationDeployments.id })
					.from(applicationDeployments)
					.where(
						and(
							eq(applicationDeployments.applicationBuildId, applicationId),
							isNull(applicationDeployments.deletedAt),
						),
					)
					.orderBy(desc(applicationDeployments.createdAt))
					.limit(1);
				if (local)
					await db
						.update(applicationDeployments)
						.set({
							logsCiphertext: encryptCredential(deployment.logs),
							logsCapturedAt: new Date(),
							providerDeploymentId: deployment.id,
							commitSha: deployment.commitSha ?? undefined,
							commitMessage: deployment.commitMessage ?? undefined,
							trigger: deployment.trigger,
							updatedAt: new Date(),
						})
						.where(eq(applicationDeployments.id, local.id));
				await recordAuditLog({
					actorUserId: workspace.actorUserId,
					action: 'application.logs_viewed',
					resourceType: 'application_build',
					resourceId: applicationId,
					metadata: {
						workspacePublicId,
						source: 'deployment',
						providerDeploymentId: deployment.id,
					},
					ipAddress: metadata.ipAddress,
					userAgent: metadata.userAgent,
				});
				return resp.success('Latest deployment logs retrieved.', {
					logs: deployment.logs,
					source: 'deployment',
				});
			}
		} catch (error) {
			return resp.failure(
				error instanceof Error
					? error.message
					: 'Application logs unavailable.',
				resp.codes.EXTERNAL_SERVICE_ERROR,
				undefined,
				null,
				undefined,
				502,
			);
		}
	}
}
