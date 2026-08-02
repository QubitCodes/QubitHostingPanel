import { and, eq, isNull } from 'drizzle-orm';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

import { db } from '@db/client';
import { platformRoles, platformUserRoles, users } from '@db/schema';
import { seedEssentialData } from '@db/seeders/db_format_seeder';

const argumentsSchema = z.object({
	countryCode: z.string().regex(/^\d{1,4}$/),
	displayName: z.string().trim().min(1).max(160).default('Super Admin'),
	mobile: z.string().regex(/^\d{4,20}$/)
});

function readArgument(name: string): string | undefined {
	return process.argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}

/** Creates or finds one explicitly supplied identity and grants the seeded Super Admin role. */
export async function seedSuperAdmin(input: unknown): Promise<string> {
	const parsed = argumentsSchema.parse(input);
	await seedEssentialData();
	const countryCode = `+${parsed.countryCode}`;
	await db.insert(users).values({
		mobile: parsed.mobile,
		countryCode,
		displayName: parsed.displayName
	}).onConflictDoNothing();
	const [user] = await db.select().from(users).where(and(eq(users.countryCode, countryCode), eq(users.mobile, parsed.mobile), isNull(users.deletedAt))).limit(1);
	const [role] = await db.select().from(platformRoles).where(and(eq(platformRoles.code, 'super_admin'), isNull(platformRoles.deletedAt))).limit(1);
	if (!user || !role) throw new Error('Unable to resolve the Super Admin identity or role.');
	await db.insert(platformUserRoles).values({ userId: user.id, roleId: role.id }).onConflictDoNothing();
	return user.id;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const userId = await seedSuperAdmin({
		countryCode: readArgument('country-code'),
		displayName: readArgument('display-name'),
		mobile: readArgument('mobile') ?? readArgument('local-mobile')
	});
	console.info(`Super Admin seeded with user ID ${userId}.`);
}
