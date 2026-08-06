import { and, eq, isNull, sql } from 'drizzle-orm';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { db } from '@db/client';
import {
	platformPermissions,
	platformRolePermissions,
	platformRoles,
	packageCategories,
	entitlementDefinitions,
	packageEntitlements,
	packagePrices,
	packages,
	runtimeImages,
} from '@db/schema';

const RUNTIME_SEEDS = [
	{ code: 'node-22', language: 'node', version: '22.23.1', repository: 'qubitcodes/runtime-node', tag: '22.23.1', defaultPort: 3000, isDefault: false },
	{ code: 'node-24', language: 'node', version: '24.18.0', repository: 'qubitcodes/runtime-node', tag: '24.18.0', defaultPort: 3000, isDefault: true },
	{ code: 'php-8.3', language: 'php', version: '8.3.32', repository: 'qubitcodes/runtime-php', tag: '8.3.32', defaultPort: 80, isDefault: false },
	{ code: 'php-8.5', language: 'php', version: '8.5.8', repository: 'qubitcodes/runtime-php', tag: '8.5.8', defaultPort: 80, isDefault: true },
	{ code: 'python-3.12', language: 'python', version: '3.12.13', repository: 'qubitcodes/runtime-python', tag: '3.12.13', defaultPort: 8000, isDefault: false },
	{ code: 'python-3.13', language: 'python', version: '3.13.14', repository: 'qubitcodes/runtime-python', tag: '3.13.14', defaultPort: 8000, isDefault: true },
	{ code: 'ruby-3.4', language: 'ruby', version: '3.4.10', repository: 'qubitcodes/runtime-ruby', tag: '3.4.10', defaultPort: 3000, isDefault: true },
	{ code: 'static-nginx', language: 'static', version: '1.30.4', repository: 'qubitcodes/runtime-static', tag: '1.30.4', defaultPort: 80, isDefault: true },
] as const;

/** Seeds approved runtime references after their corresponding workflow definitions exist. */
async function seedRuntimeCatalogue(): Promise<void> {
	for (const runtime of RUNTIME_SEEDS) {
		await db.insert(runtimeImages).values(runtime).onConflictDoUpdate({
			target: runtimeImages.code,
			targetWhere: sql`${runtimeImages.deletedAt} IS NULL`,
			set: {
				defaultPort: runtime.defaultPort,
				isDefault: runtime.isDefault,
				language: runtime.language,
				repository: runtime.repository,
				status: 'active',
				tag: runtime.tag,
				updatedAt: new Date(),
				version: runtime.version,
			},
		});
	}
}

const PACKAGE_SEEDS = [
	{ name: 'Launch', slug: 'launch', categorySlug: 'cloud-app-hosting', description: 'A focused starter plan for one production application.', monthly: 399, trialDuration: 7, displayOrder: 10 },
	{ name: 'Growth', slug: 'growth', categorySlug: 'cloud-app-hosting', description: 'Room for growing applications, databases, domains, and daily backups.', monthly: 799, trialDuration: 7, displayOrder: 20 },
	{ name: 'Business', slug: 'business', categorySlug: 'cloud-app-hosting', description: 'Higher application and database capacity for established teams.', monthly: 1499, trialDuration: 14, displayOrder: 30 },
	{ name: 'Cloud 2 GB', slug: 'cloud-2-gb', categorySlug: 'managed-cloud', description: 'Managed cloud environment with a 2 GB compute target.', monthly: 2499, trialDuration: null, displayOrder: 40 },
	{ name: 'Cloud 4 GB', slug: 'cloud-4-gb', categorySlug: 'managed-cloud', description: 'Managed cloud environment with a 4 GB compute target.', monthly: 4499, trialDuration: null, displayOrder: 50 },
	{ name: 'Cloud 8 GB', slug: 'cloud-8-gb', categorySlug: 'managed-cloud', description: 'Managed cloud environment with an 8 GB compute target.', monthly: 7999, trialDuration: null, displayOrder: 60 },
] as const;

const CRON_ENTITLEMENTS = [
	{ code: 'cron.enabled', name: 'Project scheduled tasks', description: 'Allows scheduled commands inside deployed application containers.', valueType: 'boolean' as const, unit: null },
	{ code: 'cron.jobs_per_application', name: 'Scheduled tasks per application', description: 'Maximum active scheduled tasks allowed for each application.', valueType: 'number' as const, unit: 'tasks' },
	{ code: 'cron.minimum_interval_minutes', name: 'Minimum scheduled task interval', description: 'Shortest permitted interval between executions.', valueType: 'number' as const, unit: 'minutes' },
	{ code: 'cron.timeout_seconds', name: 'Scheduled task timeout', description: 'Maximum execution timeout for each scheduled task.', valueType: 'number' as const, unit: 'seconds' },
	{ code: 'deployments.manual_enabled', name: 'Manual deployments', description: 'Allows deployments requested from the application dashboard.', valueType: 'boolean' as const, unit: null },
	{ code: 'deployments.auto_enabled', name: 'Automatic deployments', description: 'Allows GitHub push based deployments.', valueType: 'boolean' as const, unit: null },
	{ code: 'deployments.history_limit', name: 'Deployment history entries', description: 'Maximum deployment history entries shown per application.', valueType: 'number' as const, unit: 'deployments' },
	{ code: 'deployments.retention_days', name: 'Deployment history retention', description: 'Days deployment history and captured logs are retained.', valueType: 'number' as const, unit: 'days' },
] as const;

const CRON_PACKAGE_LIMITS: Record<string, { enabled: boolean; jobs: number; interval: number; timeout: number }> = {
	launch: { enabled: true, jobs: 1, interval: 720, timeout: 300 },
	growth: { enabled: true, jobs: 3, interval: 240, timeout: 600 },
	business: { enabled: true, jobs: 10, interval: 60, timeout: 900 },
	'cloud-2-gb': { enabled: true, jobs: 10, interval: 15, timeout: 1200 },
	'cloud-4-gb': { enabled: true, jobs: 20, interval: 5, timeout: 1800 },
	'cloud-8-gb': { enabled: true, jobs: 40, interval: 1, timeout: 3600 },
};

async function seedPackageCatalogue(): Promise<void> {
	for (const entitlement of CRON_ENTITLEMENTS) await db.insert(entitlementDefinitions).values({ ...entitlement, enforcementMode: 'hard', isCustomerVisible: true }).onConflictDoUpdate({ target: entitlementDefinitions.code, targetWhere: sql`${entitlementDefinitions.deletedAt} IS NULL`, set: { name: entitlement.name, description: entitlement.description, unit: entitlement.unit, updatedAt: new Date() } });
	const cronDefinitions = await db.select({ code: entitlementDefinitions.code, id: entitlementDefinitions.id }).from(entitlementDefinitions).where(isNull(entitlementDefinitions.deletedAt));
	const categories = [
		{ name: 'Cloud App Hosting', slug: 'cloud-app-hosting', description: 'Managed application hosting on shared cloud capacity.', displayOrder: 10 },
		{ name: 'Managed Cloud', slug: 'managed-cloud', description: 'Dedicated managed cloud capacity for demanding workloads.', displayOrder: 20 },
	] as const;
	for (const category of categories)
		await db.insert(packageCategories).values(category).onConflictDoUpdate({ target: packageCategories.slug, targetWhere: sql`${packageCategories.deletedAt} IS NULL`, set: { name: category.name, description: category.description, displayOrder: category.displayOrder, updatedAt: new Date() } });
	const categoryRows = await db.select({ id: packageCategories.id, slug: packageCategories.slug }).from(packageCategories).where(isNull(packageCategories.deletedAt));
	for (const seed of PACKAGE_SEEDS) {
		const categoryId = categoryRows.find(({ slug }) => slug === seed.categorySlug)?.id;
		if (!categoryId) throw new Error(`Package category ${seed.categorySlug} was not seeded.`);
		await db.insert(packages).values({
			categoryId,
			name: seed.name,
			slug: seed.slug,
			description: seed.description,
			status: 'draft',
			displayOrder: seed.displayOrder,
			trialEnabled: seed.trialDuration !== null,
			trialDuration: seed.trialDuration,
			trialDurationUnit: seed.trialDuration === null ? null : 'day',
		}).onConflictDoUpdate({ target: packages.slug, targetWhere: sql`${packages.deletedAt} IS NULL`, set: { categoryId, name: seed.name, description: seed.description, displayOrder: seed.displayOrder, updatedAt: new Date() } });
		const [packageRow] = await db.select({ id: packages.id }).from(packages).where(and(eq(packages.slug, seed.slug), isNull(packages.deletedAt))).limit(1);
		if (!packageRow) throw new Error(`Package ${seed.slug} was not seeded.`);
		const limits = CRON_PACKAGE_LIMITS[seed.slug];
		if (limits) for (const [code, value] of Object.entries({ 'cron.enabled': limits.enabled, 'cron.jobs_per_application': limits.jobs, 'cron.minimum_interval_minutes': limits.interval, 'cron.timeout_seconds': limits.timeout })) {
			const entitlementId = cronDefinitions.find((item) => item.code === code)?.id;
			if (!entitlementId) throw new Error(`Entitlement ${code} was not seeded.`);
			await db.insert(packageEntitlements).values({ packageId: packageRow.id, entitlementId, booleanValue: typeof value === 'boolean' ? value : null, numericValue: typeof value === 'number' ? value : null }).onConflictDoUpdate({ target: [packageEntitlements.packageId, packageEntitlements.entitlementId], targetWhere: sql`${packageEntitlements.deletedAt} IS NULL`, set: { booleanValue: typeof value === 'boolean' ? value : null, numericValue: typeof value === 'number' ? value : null, updatedAt: new Date() } });
		}
		const deploymentLimits = seed.slug === 'launch' ? { auto: false, history: 2, retention: 7 } : seed.slug === 'growth' ? { auto: true, history: 10, retention: 30 } : { auto: true, history: 50, retention: 90 };
		for (const [code, value] of Object.entries({ 'deployments.manual_enabled': true, 'deployments.auto_enabled': deploymentLimits.auto, 'deployments.history_limit': deploymentLimits.history, 'deployments.retention_days': deploymentLimits.retention })) {
			const entitlementId = cronDefinitions.find((item) => item.code === code)?.id;
			if (!entitlementId) throw new Error(`Entitlement ${code} was not seeded.`);
			await db.insert(packageEntitlements).values({ packageId: packageRow.id, entitlementId, booleanValue: typeof value === 'boolean' ? value : null, numericValue: typeof value === 'number' ? value : null }).onConflictDoUpdate({ target: [packageEntitlements.packageId, packageEntitlements.entitlementId], targetWhere: sql`${packageEntitlements.deletedAt} IS NULL`, set: { booleanValue: typeof value === 'boolean' ? value : null, numericValue: typeof value === 'number' ? value : null, updatedAt: new Date() } });
		}
		for (const price of [{ billingInterval: 'month' as const, amountMinor: seed.monthly * 100 }, { billingInterval: 'year' as const, amountMinor: seed.monthly * 10 * 100 }]) {
			const [existing] = await db.select({ id: packagePrices.id }).from(packagePrices).where(and(eq(packagePrices.packageId, packageRow.id), eq(packagePrices.currency, 'INR'), eq(packagePrices.billingInterval, price.billingInterval), eq(packagePrices.isActive, true), isNull(packagePrices.deletedAt))).limit(1);
			if (!existing) await db.insert(packagePrices).values({ packageId: packageRow.id, currency: 'INR', billingInterval: price.billingInterval, amountMinor: price.amountMinor, taxBehavior: 'exclusive', isActive: true, isPublic: false });
		}
	}
}

const ROLE_SEEDS = [
	{
		code: 'super_admin',
		name: 'Super Admin',
		description: 'Controlled platform owner role.',
		isSystem: true,
		isSuperAdmin: true,
	},
	{
		code: 'administrator',
		name: 'Administrator',
		description: 'General platform administration.',
		isSystem: true,
		isSuperAdmin: false,
	},
	{
		code: 'billing_manager',
		name: 'Billing Manager',
		description: 'Commercial and billing operations.',
		isSystem: true,
		isSuperAdmin: false,
	},
	{
		code: 'support_operator',
		name: 'Support Operator',
		description: 'Customer support operations.',
		isSystem: true,
		isSuperAdmin: false,
	},
	{
		code: 'readonly_operator',
		name: 'Read-only Operator',
		description: 'Read-only operational visibility.',
		isSystem: true,
		isSuperAdmin: false,
	},
] as const;
const RESOURCES = [
	'admins',
	'roles',
	'packages',
	'package_categories',
	'offers',
	'customers',
	'organisations',
	'subscriptions',
	'usage',
	'servers',
	'payments',
	'provisioning',
	'database_clusters',
	'audit_logs',
	'platform_settings',
	'applications',
	'application_files',
	'application_secrets',
	'deployments',
	'git_connections',
	'databases',
	'domains',
	'dns_records',
	'cron_jobs',
	'user_sessions',
	'authentication_events',
] as const;
const ACTIONS = ['view', 'create', 'update', 'delete'] as const;
const SPECIAL_PERMISSIONS = [
	{ code: 'customers.suspend', description: 'Suspend or restore customer identities.', name: 'Suspend customers' },
	{ code: 'customers.impersonate', description: 'Start a separately audited customer support session.', name: 'Impersonate customers' },
	{ code: 'applications.start', description: 'Start a customer application.', name: 'Start applications' },
	{ code: 'applications.stop', description: 'Stop a customer application.', name: 'Stop applications' },
	{ code: 'applications.suspend', description: 'Suspend and unsuspend a customer application with an audited reason.', name: 'Suspend applications' },
	{ code: 'applications.restart', description: 'Restart a customer application.', name: 'Restart applications' },
	{ code: 'user_sessions.revoke', description: 'Revoke customer sessions.', name: 'Revoke customer sessions' },
	{ code: 'application_files.download', description: 'Download files from a customer application.', name: 'Download application files' },
	{ code: 'application_files.read', description: 'Read source files from a customer application repository.', name: 'Read application files' },
	{ code: 'application_files.reveal_sensitive', description: 'Read protected application configuration files with a reason.', name: 'Reveal sensitive application files' },
	{ code: 'application_secrets.reveal', description: 'Reveal encrypted customer application secrets with a reason.', name: 'Reveal application secrets' },
	{ code: 'databases.reveal_credentials', description: 'Reveal customer database credentials with a reason.', name: 'Reveal database credentials' },
	{ code: 'databases.rotate_credentials', description: 'Rotate customer database credentials.', name: 'Rotate database credentials' },
	{ code: 'databases.restore', description: 'Restore customer databases from backups.', name: 'Restore customer databases' },
	{ code: 'deployments.retry', description: 'Retry or redeploy customer applications.', name: 'Retry deployments' },
	{ code: 'domains.verify', description: 'Run or override domain verification workflows.', name: 'Verify customer domains' },
	{ code: 'database_clusters.rotate_credentials', description: 'Rotate encrypted shared database administrator credentials.', name: 'Rotate database cluster credentials' },
	{ code: 'database_clusters.manage_backups', description: 'Configure and trigger shared database backups.', name: 'Manage database cluster backups' },
	{
		code: 'packages.publish',
		description: 'Publish or archive commercial packages.',
		name: 'Publish packages',
	},
	{
		code: 'api_docs.view',
		description: 'Access the protected Scalar API reference and OpenAPI contract.',
		name: 'View API documentation',
	},
] as const;
const ROLE_PERMISSION_RULES: Record<string, (code: string) => boolean> = {
	administrator: () => true,
	billing_manager: (code) =>
		[
			'packages.',
			'offers.',
			'subscriptions.',
			'usage.',
			'audit_logs.view',
		].some((prefix) => code.startsWith(prefix)),
	readonly_operator: (code) => code.endsWith('.view'),
	support_operator: (code) =>
		[
			'customers.view',
			'customers.update',
			'applications.view',
			'deployments.view',
			'git_connections.view',
			'databases.view',
			'domains.view',
			'cron_jobs.view',
			'user_sessions.view',
			'authentication_events.view',
			'organisations.view',
			'organisations.update',
			'subscriptions.view',
			'usage.view',
			'admins.view',
		].includes(code),
};

/** Seeds idempotent platform roles and permissions without embedding an administrator identity. */
export async function seedEssentialData(): Promise<void> {
	for (const role of ROLE_SEEDS)
		await db.insert(platformRoles).values(role).onConflictDoNothing();
	for (const resource of RESOURCES) {
		for (const action of ACTIONS) {
			const code = `${resource}.${action}`;
			const name = `${action[0]?.toUpperCase()}${action.slice(1)} ${resource.replaceAll('_', ' ')}`;
			await db
				.insert(platformPermissions)
				.values({ code, name })
				.onConflictDoUpdate({
					target: platformPermissions.code,
					targetWhere: sql`${platformPermissions.deletedAt} IS NULL`,
					set: { name, updatedAt: new Date() },
				});
		}
	}
	for (const permission of SPECIAL_PERMISSIONS) {
		await db
			.insert(platformPermissions)
			.values(permission)
			.onConflictDoUpdate({
				set: {
					description: permission.description,
					name: permission.name,
					updatedAt: new Date(),
				},
				target: platformPermissions.code,
				targetWhere: sql`${platformPermissions.deletedAt} IS NULL`,
			});
	}
	const [superAdminRole] = await db
		.select()
		.from(platformRoles)
		.where(
			and(
				eq(platformRoles.code, 'super_admin'),
				isNull(platformRoles.deletedAt),
			),
		)
		.limit(1);
	const permissions = await db
		.select()
		.from(platformPermissions)
		.where(isNull(platformPermissions.deletedAt));
	if (!superAdminRole) throw new Error('Super Admin role seed failed.');
	for (const permission of permissions) {
		await db
			.insert(platformRolePermissions)
			.values({ roleId: superAdminRole.id, permissionId: permission.id })
			.onConflictDoNothing();
	}
	const standardRoles = await db
		.select()
		.from(platformRoles)
		.where(
			and(
				eq(platformRoles.isSuperAdmin, false),
				isNull(platformRoles.deletedAt),
			),
		);
	for (const role of standardRoles) {
		const allows = ROLE_PERMISSION_RULES[role.code];
		if (!allows) continue;
		for (const permission of permissions.filter(({ code }) => allows(code))) {
			await db
				.insert(platformRolePermissions)
				.values({ roleId: role.id, permissionId: permission.id })
				.onConflictDoNothing();
		}
	}
	await seedPackageCatalogue();
	await seedRuntimeCatalogue();
	console.info(
		`Seeded ${ROLE_SEEDS.length} roles, ${permissions.length} permissions, ${PACKAGE_SEEDS.length} draft packages, and ${RUNTIME_SEEDS.length} runtimes.`,
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
	await seedEssentialData();
