/** Development-data seeder placeholder; feature-owned fixtures are added with their domains. */
export async function seedDummyData(): Promise<void> {
	if (process.env.APP_ENV === 'production') {
		throw new Error('Dummy data cannot be seeded in production.');
	}

	console.info('No Phase 0 dummy records require seeding.');
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
	await seedDummyData();
}
