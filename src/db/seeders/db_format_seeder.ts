import { and, eq, isNull } from 'drizzle-orm';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { db } from '@db/client';
import {
	platformPermissions,
	platformRolePermissions,
	platformRoles,
} from '@db/schema';

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
	'offers',
	'customers',
	'organisations',
	'subscriptions',
	'usage',
	'servers',
	'audit_logs',
] as const;
const ACTIONS = ['view', 'create', 'update', 'delete'] as const;
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
			const name = `${action[0]?.toUpperCase()}${action.slice(1)} ${resource}`;
			await db
				.insert(platformPermissions)
				.values({ code, name })
				.onConflictDoUpdate({
					target: platformPermissions.code,
					set: { name, updatedAt: new Date() },
				});
		}
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
	console.info(
		`Seeded ${ROLE_SEEDS.length} roles and ${permissions.length} permissions.`,
	);
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
	await seedEssentialData();
