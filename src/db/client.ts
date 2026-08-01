import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { getEnvironment } from '@config/env';
import * as schema from '@db/schema';

let pool: Pool | undefined;

/** Returns the shared PostgreSQL pool and creates it only on first database use. */
export function getDatabasePool(): Pool {
	pool ??= new Pool({ connectionString: getEnvironment().DATABASE_URL });
	return pool;
}

/** Drizzle database bound to the application schema and lazy PostgreSQL pool. */
export const db = drizzle({
	client: new Proxy({} as Pool, {
		get: (_target, property) => Reflect.get(getDatabasePool(), property, getDatabasePool())
	}),
	schema
});
