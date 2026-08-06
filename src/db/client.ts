import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from '@db/schema';

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	connectionTimeoutMillis: 5_000,
	idleTimeoutMillis: 30_000,
	keepAlive: true,
	max: 10,
	query_timeout: 15_000,
	statement_timeout: 15_000,
});

pool.on('error', (error) => console.error('Idle PostgreSQL connection failed.', error));

/** Returns the shared PostgreSQL pool for diagnostics and graceful shutdown. */
export function getDatabasePool(): Pool {
	return pool;
}

/** Drizzle database bound to the application schema and lazy PostgreSQL pool. */
export const db = drizzle({
	client: pool,
	schema
});
