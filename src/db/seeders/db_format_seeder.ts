/** Essential-data seeder placeholder; Phase 1 adds controlled roles and Super Admin setup. */
export async function seedEssentialData(): Promise<void> {
	console.info('No essential Phase 0 records require seeding.');
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
	await seedEssentialData();
}
