import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { and, count, desc, eq, gt, inArray, isNull } from 'drizzle-orm';

import { ApplicationController } from '@controllers/ApplicationController';
import { LogicalDatabaseController } from '@controllers/LogicalDatabaseController';
import { UsageController } from '@controllers/UsageController';
import { db, getDatabasePool } from '@db/client';
import {
	applicationBuilds,
	applicationDeployments,
	applicationDomains,
	customers,
	logicalDatabases,
	userSessions,
	workspaceEntitlementOverrides,
	workspaceMemberships,
	workspaceResources,
	workspaces,
} from '@db/schema';
import {
	frameworkAcceptanceCase,
	type FrameworkAcceptanceCase,
} from '@config/frameworkAcceptanceCatalog';
import { issueAccessToken } from '@services/auth/tokenService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';
import { processProvisioningJobs } from '@services/provisioning/provisioningService';
import type { RequestMetadata } from '@utils/request';

interface ApiEnvelope<T> {
	status: boolean;
	message: string;
	data: T;
}

interface AcceptanceTarget {
	sessionId: string;
	sessionTokenVersion: number;
	userId: string;
	workspaceId: string;
	workspacePublicId: number;
}

interface CreatedApplication {
	id: string;
	name: string;
}

interface CreatedDatabase {
	id: string;
	name: string;
}

interface AcceptanceEvidence {
	applicationId: string;
	buildLogBytes: number;
	deploymentCount: number;
	healthBody: string;
	healthStatus: number;
	latestDeploymentStatus: string | null;
	localDeploymentStatus: string | null;
	providerId: string;
	providerStatus: string;
	runtimeLogBytes: number;
	url: string;
}

const REPOSITORY =
	process.env.FRAMEWORK_ACCEPTANCE_REPOSITORY_URL ??
	'https://github.com/QubitCodes/QubitHostingPanel';
const BRANCH = process.env.FRAMEWORK_ACCEPTANCE_BRANCH ?? 'main';
const WORKSPACE_PUBLIC_ID = Number.parseInt(
	process.env.FRAMEWORK_ACCEPTANCE_WORKSPACE_PUBLIC_ID ?? '100001',
	10,
);
const TIMEOUT_MS = Number.parseInt(
	process.env.FRAMEWORK_ACCEPTANCE_LIVE_TIMEOUT_MS ?? '900000',
	10,
);
const metadata: RequestMetadata = {
	userAgent: 'Ghost Deploy framework acceptance runner',
	sessionClient: { clientHints: {} },
};

/** Reads one standardized controller response without printing secret data. */
async function responseData<T>(response: Response): Promise<T> {
	const envelope = (await response.json()) as ApiEnvelope<T>;
	if (!response.ok || !envelope.status) throw new Error(envelope.message);
	return envelope.data;
}

/** Creates an in-process request carrying the same bearer token used by HTTP routes. */
function authenticatedRequest(token: string, method = 'POST'): Request {
	return new Request('https://ghostdeploy.com/api/v1/framework-acceptance', {
		method,
		headers: { authorization: `Bearer ${token}` },
	});
}

/** Removes common credential forms before acceptance diagnostics reach stdout. */
function safeLogTail(logs?: string | null): string | null {
	if (!logs) return null;
	return logs
		.replace(/:\/\/([^\s:@/]+):([^\s@/]+)@/g, '://$1:***@')
		.replace(
			/^([^\n=]*(?:secret|token|password|private[_-]?key|database_url)[^\n=]*)=.*$/gim,
			'$1=***',
		)
		.slice(-8_000);
}

/** Produces provider evidence for a terminal deployment without exposing secrets. */
async function failureEvidence(providerId: string): Promise<string> {
	const provider = await hostingProvider();
	const deployments = await provider
		.listApplicationDeployments(providerId, 3)
		.catch(() => []);
	const latest = deployments[0];
	const runtimeLogs = await provider
		.getApplicationLogs(providerId, 200)
		.catch(() => '');
	return JSON.stringify(
		{
			latestDeploymentStatus: latest?.status ?? null,
			diagnostic: latest?.diagnostic ?? null,
			buildLogTail: safeLogTail(latest?.logs),
			runtimeLogTail: safeLogTail(runtimeLogs),
		},
		null,
		2,
	);
}

/** Resolves the latest active owner session for the explicitly selected workspace. */
async function acceptanceTarget(): Promise<AcceptanceTarget> {
	if (!Number.isInteger(WORKSPACE_PUBLIC_ID))
		throw new Error('FRAMEWORK_ACCEPTANCE_WORKSPACE_PUBLIC_ID is invalid.');
	const [target] = await db
		.select({
			sessionId: userSessions.id,
			sessionTokenVersion: userSessions.tokenVersion,
			userId: customers.userId,
			workspaceId: workspaces.id,
			workspacePublicId: workspaces.publicId,
		})
		.from(workspaces)
		.innerJoin(
			workspaceMemberships,
			and(
				eq(workspaceMemberships.workspaceId, workspaces.id),
				eq(workspaceMemberships.role, 'owner'),
				eq(workspaceMemberships.status, 'active'),
				isNull(workspaceMemberships.deletedAt),
			),
		)
		.innerJoin(
			customers,
			and(
				eq(customers.id, workspaceMemberships.customerId),
				isNull(customers.deletedAt),
			),
		)
		.innerJoin(
			userSessions,
			and(
				eq(userSessions.userId, customers.userId),
				isNull(userSessions.revokedAt),
				isNull(userSessions.deletedAt),
				gt(userSessions.expiresAt, new Date()),
			),
		)
		.where(
			and(
				eq(workspaces.publicId, WORKSPACE_PUBLIC_ID),
				eq(workspaces.status, 'active'),
				isNull(workspaces.deletedAt),
			),
		)
		.orderBy(desc(userSessions.lastActiveAt))
		.limit(1);
	if (!target) throw new Error('An active acceptance workspace session is required.');
	return target;
}

/** Creates an expiring, audited count override and refuses to replace an existing one. */
async function createCountOverride(
	target: AcceptanceTarget,
	adminToken: string,
	code: 'applications.count' | 'databases.count',
	minimumValue: number,
): Promise<string> {
	const [existing] = await db
		.select({ id: workspaceEntitlementOverrides.id })
		.from(workspaceEntitlementOverrides)
		.where(
			and(
				eq(workspaceEntitlementOverrides.workspaceId, target.workspaceId),
				eq(workspaceEntitlementOverrides.entitlementCode, code),
				isNull(workspaceEntitlementOverrides.revokedAt),
				isNull(workspaceEntitlementOverrides.deletedAt),
			),
		)
		.limit(1);
	if (existing)
		throw new Error(`Refusing to replace the existing ${code} override.`);
	const [{ currentCount }] =
		code === 'applications.count'
			? await db
					.select({ currentCount: count() })
					.from(applicationBuilds)
					.where(
						and(
							eq(applicationBuilds.workspaceId, target.workspaceId),
							isNull(applicationBuilds.deletedAt),
						),
					)
			: await db
					.select({ currentCount: count() })
					.from(logicalDatabases)
					.where(
						and(
							eq(logicalDatabases.workspaceId, target.workspaceId),
							isNull(logicalDatabases.deletedAt),
						),
					);
	const value = Math.max(minimumValue, Number(currentCount) + 1);
	const created = await responseData<{ id: string }>(
		await UsageController.override(
			authenticatedRequest(adminToken),
			target.workspacePublicId,
			{
				entitlementCode: code,
				enforcementMode: 'hard',
				numericValue: value,
				isUnlimited: false,
				reason: 'Temporary first-batch framework acceptance capacity.',
				expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1_000).toISOString(),
			},
			metadata,
		),
	);
	return created.id;
}

/** Creates one isolated shared database without exposing returned credentials. */
async function createDatabase(
	target: AcceptanceTarget,
	personalToken: string,
	entry: FrameworkAcceptanceCase,
	suffix: string,
): Promise<CreatedDatabase | undefined> {
	if (entry.databaseMode === 'none') return undefined;
	const engine = entry.databaseMode === 'required-mysql' ? 'mysql' : 'postgresql';
	const name = `gd_accept_${entry.code}_${suffix}`.slice(0, 63);
	const data = await responseData<{
		database: { databaseName: string; id: string };
	}>(
		await LogicalDatabaseController.create(
			authenticatedRequest(personalToken),
			target.workspacePublicId,
			{ engine, name, userMode: 'new', connectionLimit: 5, storageQuotaMb: 128 },
			metadata,
		),
	);
	return { id: data.database.id, name: data.database.databaseName };
}

/** Creates one application using the normal controller, quota, audit and job path. */
async function createApplication(
	target: AcceptanceTarget,
	personalToken: string,
	entry: FrameworkAcceptanceCase,
	database: CreatedDatabase | undefined,
	suffix: string,
	acceptanceToken: string,
): Promise<CreatedApplication> {
	const name = `Acceptance ${entry.code} ${suffix}`;
	const environmentVariables: Array<{
		key: string;
		value: string;
		isSecret: boolean;
		scope: 'build' | 'both' | 'runtime';
	}> = [
		...(entry.code === 'laravel'
			? [
					{
						key: 'APP_KEY',
						value: `base64:${randomBytes(32).toString('base64')}`,
						isSecret: true,
						scope: 'runtime' as const,
					},
				]
			: []),
		...(entry.persistencePath
			? [
					{
						key: 'FRAMEWORK_ACCEPTANCE_TOKEN',
						value: acceptanceToken,
						isSecret: true,
						scope: 'runtime' as const,
					},
				]
			: []),
	];
	const data = await responseData<{ id: string }>(
		await ApplicationController.create(
			authenticatedRequest(personalToken),
			target.workspacePublicId,
			{
				name,
				runtimeCode: entry.runtimeCode,
				repository: REPOSITORY,
				branch: BRANCH,
				buildPack: entry.buildPack,
				deploymentEnvironment: 'testing',
				autoDeployEnabled: false,
				framework: entry.code,
				environmentVariables,
				installCommand: entry.installCommand,
				buildCommand: entry.buildCommand,
				startCommand: entry.startCommand,
				baseDirectory: entry.fixtureDirectory,
				publishDirectory: entry.publishDirectory,
				port: entry.port,
				domains: [],
				subdomain: `accept-${entry.code}`.slice(0, 50),
				subdomainSuffix: suffix,
				databases: database
					? [{ databaseId: database.id, environmentPrefix: 'DATABASE' }]
					: [],
			},
			metadata,
		),
	);
	return { id: data.id, name };
}

/** Waits for provider completion, public HTTPS health, logs and local reconciliation. */
async function waitForAcceptance(
	application: CreatedApplication,
	entry: FrameworkAcceptanceCase,
): Promise<AcceptanceEvidence> {
	const deadline = Date.now() + TIMEOUT_MS;
	let lastStatus = '';
	while (Date.now() < deadline) {
		await processProvisioningJobs(10);
		const [state] = await db
			.select({
				buildStatus: applicationBuilds.status,
				failureReason: applicationBuilds.failureReason,
				providerId: workspaceResources.providerResourceId,
				resourceStatus: workspaceResources.status,
				hostname: applicationDomains.hostname,
			})
			.from(applicationBuilds)
			.leftJoin(
				workspaceResources,
				eq(workspaceResources.id, applicationBuilds.resourceId),
			)
			.leftJoin(
				applicationDomains,
				and(
					eq(applicationDomains.applicationBuildId, applicationBuilds.id),
					eq(applicationDomains.type, 'platform'),
					isNull(applicationDomains.deletedAt),
				),
			)
			.where(eq(applicationBuilds.id, application.id))
			.limit(1);
		if (!state) throw new Error('Acceptance application disappeared.');
		const status = `${state.buildStatus}/${state.resourceStatus ?? 'pending'}`;
		if (status !== lastStatus) {
			console.log(`${entry.code}: ${status}`);
			lastStatus = status;
		}
		if (state.buildStatus === 'failed')
			throw new Error(
				`${state.failureReason ?? `${entry.code} deployment failed.`}${
					state.providerId ? `\n${await failureEvidence(state.providerId)}` : ''
				}`,
			);
		if (state.providerId && state.hostname) {
			const provider = await hostingProvider();
			const providerState = await provider.getApplicationState(state.providerId);
			if (/running/i.test(providerState.status)) {
				const url = `https://${state.hostname}${entry.healthPath}`;
				try {
					const response = await fetch(url, {
						signal: AbortSignal.timeout(15_000),
					});
					const body = await response.text();
					if (response.ok && body.includes(entry.healthResponseContains)) {
						await processProvisioningJobs(10);
						const deployments = await provider.listApplicationDeployments(
							state.providerId,
							5,
						);
						const runtimeLogs = await provider
							.getApplicationLogs(state.providerId, 200)
							.catch(() => '');
						const [localDeployment] = await db
							.select({ status: applicationDeployments.status })
							.from(applicationDeployments)
							.where(
								and(
									eq(
										applicationDeployments.applicationBuildId,
										application.id,
									),
									isNull(applicationDeployments.deletedAt),
								),
							)
							.orderBy(desc(applicationDeployments.createdAt))
							.limit(1);
						if (localDeployment?.status !== 'running') {
							await delay(5_000);
							continue;
						}
						return {
							applicationId: application.id,
							providerId: state.providerId,
							providerStatus: providerState.status,
							localDeploymentStatus: localDeployment?.status ?? null,
							url,
							healthStatus: response.status,
							healthBody: body.slice(0, 500),
							deploymentCount: deployments.length,
							latestDeploymentStatus: deployments[0]?.status ?? null,
							buildLogBytes: deployments[0]?.logs?.length ?? 0,
							runtimeLogBytes: runtimeLogs.length,
						};
					}
				} catch {
					/* DNS, TLS or the health endpoint may still be converging. */
				}
			}
			// Coolify can temporarily report an exited old container while a new
			// image is still building. The provisioning worker reconciles a truly
			// terminal state into applicationBuilds.status on its next due pass.
		}
		await delay(10_000);
	}
	throw new Error(`${entry.code} acceptance timed out after ${TIMEOUT_MS}ms.`);
}

/** Writes a protected marker, redeploys the same app and proves its checksum survives replacement. */
async function verifyReplacementPersistence(
	target: AcceptanceTarget,
	personalToken: string,
	application: CreatedApplication,
	entry: FrameworkAcceptanceCase,
	evidence: AcceptanceEvidence,
	acceptanceToken: string,
): Promise<Record<string, unknown> | null> {
	if (!entry.persistencePath) return null;
	const markerUrl = new URL(entry.persistencePath, evidence.url).toString();
	const marker = `ghost-deploy-${entry.code}-${randomBytes(24).toString('hex')}`;
	const requestMarker = async (method: 'GET' | 'POST') => {
		const response = await fetch(markerUrl, {
			method,
			headers: {
				'x-framework-acceptance-token': acceptanceToken,
				...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
			},
			body: method === 'POST' ? JSON.stringify({ marker }) : undefined,
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok)
			throw new Error(`${entry.code} persistence endpoint returned ${response.status}.`);
		return (await response.json()) as { checksum?: string };
	};
	const before = await requestMarker('POST');
	if (!before.checksum) throw new Error(`${entry.code} persistence checksum was not created.`);
	const provider = await hostingProvider();
	const existingIds = new Set(
		(await provider.listApplicationDeployments(evidence.providerId, 10)).map(
			(deployment) => deployment.id,
		),
	);
	await responseData(
		await ApplicationController.control(
			authenticatedRequest(personalToken),
			target.workspacePublicId,
			application.id,
			{ action: 'redeploy', reason: 'Framework persistence acceptance.' },
			metadata,
		),
	);
	const deadline = Date.now() + TIMEOUT_MS;
	while (Date.now() < deadline) {
		const deployments = await provider.listApplicationDeployments(
			evidence.providerId,
			10,
		);
		const replacement = deployments.find(
			(deployment) => !existingIds.has(deployment.id),
		);
		if (replacement && /fail|error/i.test(replacement.status))
			throw new Error(
				`${entry.code} replacement deployment failed.\n${safeLogTail(replacement.logs) ?? ''}`,
			);
		if (replacement && /finish|success|complete/i.test(replacement.status)) {
			const [localDeployment] = await db
				.select({ status: applicationDeployments.status })
				.from(applicationDeployments)
				.where(
					and(
						eq(applicationDeployments.applicationBuildId, application.id),
						eq(applicationDeployments.providerDeploymentId, replacement.id),
						isNull(applicationDeployments.deletedAt),
					),
				)
				.limit(1);
			if (localDeployment?.status !== 'running') {
				await delay(5_000);
				continue;
			}
			let after: { checksum?: string };
			try {
				after = await requestMarker('GET');
			} catch {
				/* The replacement can finish before the public route becomes ready. */
				await delay(5_000);
				continue;
			}
			if (after.checksum !== before.checksum)
				throw new Error(`${entry.code} persistent marker changed after replacement.`);
			return {
				path: entry.persistenceDirectories[0],
				checksum: after.checksum,
				replacementDeploymentId: replacement.id,
				localDeploymentStatus: localDeployment.status,
			};
		}
		await delay(10_000);
	}
	throw new Error(`${entry.code} persistence replacement timed out.`);
}

/** Deletes only the application created by this runner. */
async function deleteApplication(
	target: AcceptanceTarget,
	personalToken: string,
	application: CreatedApplication,
): Promise<void> {
	await responseData(
		await ApplicationController.destroy(
			authenticatedRequest(personalToken, 'DELETE'),
			target.workspacePublicId,
			application.id,
			{
				acceptedImpact: true,
				confirmationName: application.name,
				databases: [],
			},
			metadata,
		),
	);
}

/** Deletes only the isolated database created by this runner. */
async function deleteDatabase(
	target: AcceptanceTarget,
	personalToken: string,
	database: CreatedDatabase,
): Promise<void> {
	await responseData(
		await LogicalDatabaseController.destroy(
			authenticatedRequest(personalToken, 'DELETE'),
			target.workspacePublicId,
			database.id,
			{
				acceptedImpact: true,
				confirmationName: database.name,
				connectedApplicationNames: [],
			},
			metadata,
		),
	);
}

async function main(): Promise<void> {
	const code = process.env.FRAMEWORK_ACCEPTANCE_CASE;
	const entry = code ? frameworkAcceptanceCase(code) : undefined;
	if (!entry)
		throw new Error(
			'FRAMEWORK_ACCEPTANCE_CASE must select one maintained framework.',
		);
	const target = await acceptanceTarget();
	const personalToken = await issueAccessToken({
		context: 'personal',
		sessionId: target.sessionId,
		tokenVersion: target.sessionTokenVersion,
		userId: target.userId,
	});
	const adminToken = await issueAccessToken({
		context: 'admin',
		sessionId: target.sessionId,
		tokenVersion: target.sessionTokenVersion,
		userId: target.userId,
	});
	const suffix = randomBytes(4)
		.toString('base64url')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')
		.slice(0, 6)
		.padEnd(6, '0');
	const overrideIds: string[] = [];
	const acceptanceToken = randomBytes(32).toString('hex');
	let database: CreatedDatabase | undefined;
	let application: CreatedApplication | undefined;
	let executionError: unknown;
	try {
		overrideIds.push(
			await createCountOverride(
				target,
				adminToken,
				'applications.count',
				2,
			),
		);
		if (entry.databaseMode !== 'none')
			overrideIds.push(
				await createCountOverride(
					target,
					adminToken,
					'databases.count',
					2,
				),
			);
		database = await createDatabase(target, personalToken, entry, suffix);
		application = await createApplication(
			target,
			personalToken,
			entry,
			database,
			suffix,
			acceptanceToken,
		);
		const evidence = await waitForAcceptance(application, entry);
		const persistence = await verifyReplacementPersistence(
			target,
			personalToken,
			application,
			entry,
			evidence,
			acceptanceToken,
		);
		console.log(
			JSON.stringify({ framework: entry.code, evidence, persistence }, null, 2),
		);
	} catch (error) {
		executionError = error;
	}
	{
		const cleanupErrors: string[] = [];
		if (application)
			await deleteApplication(target, personalToken, application).catch((error) =>
				cleanupErrors.push(
					`application: ${error instanceof Error ? error.message : String(error)}`,
				),
			);
		if (database)
			await deleteDatabase(target, personalToken, database).catch((error) =>
				cleanupErrors.push(
					`database: ${error instanceof Error ? error.message : String(error)}`,
				),
			);
		for (const overrideId of overrideIds.reverse())
			await responseData(
				await UsageController.revoke(
					authenticatedRequest(adminToken),
					target.workspacePublicId,
					overrideId,
					{ reason: 'Framework acceptance capacity released.' },
					metadata,
				),
			).catch((error) =>
				cleanupErrors.push(
					`override: ${error instanceof Error ? error.message : String(error)}`,
				),
			);
		const [activeApplication] = application
			? await db
					.select({ id: applicationBuilds.id })
					.from(applicationBuilds)
					.where(
						and(
							eq(applicationBuilds.id, application.id),
							isNull(applicationBuilds.deletedAt),
						),
					)
					.limit(1)
			: [];
		const [activeDatabase] = database
			? await db
					.select({ id: logicalDatabases.id })
					.from(logicalDatabases)
					.where(
						and(
							eq(logicalDatabases.id, database.id),
							isNull(logicalDatabases.deletedAt),
						),
					)
					.limit(1)
			: [];
		const [activeOverride] = overrideIds.length
			? await db
					.select({ id: workspaceEntitlementOverrides.id })
					.from(workspaceEntitlementOverrides)
					.where(
						and(
							inArray(workspaceEntitlementOverrides.id, overrideIds),
							isNull(workspaceEntitlementOverrides.revokedAt),
							isNull(workspaceEntitlementOverrides.deletedAt),
						),
					)
					.limit(1)
			: [];
		if (activeApplication) cleanupErrors.push('application remains active');
		if (activeDatabase) cleanupErrors.push('database remains active');
		if (activeOverride) cleanupErrors.push('entitlement override remains active');
		if (cleanupErrors.length)
			throw new Error(
				`${entry.code} acceptance cleanup failed: ${cleanupErrors.join('; ')}`,
			);
		console.log(`${entry.code}: cleanup confirmed`);
	}
	if (executionError) throw executionError;
}

try {
	await main();
} finally {
	await getDatabasePool().end();
}
