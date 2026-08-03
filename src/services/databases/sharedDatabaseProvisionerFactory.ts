import { MysqlSharedDatabaseProvisioner } from '@services/databases/MysqlSharedDatabaseProvisioner';
import { PostgresSharedDatabaseProvisioner } from '@services/databases/PostgresSharedDatabaseProvisioner';
import type { SharedDatabaseEngine, SharedDatabaseProvisioner } from '@services/databases/SharedDatabaseProvisioner';

/** Resolves the engine-specific restricted database provisioner. */
export function sharedDatabaseProvisioner(engine: SharedDatabaseEngine): SharedDatabaseProvisioner {
	return engine === 'postgresql' ? new PostgresSharedDatabaseProvisioner() : new MysqlSharedDatabaseProvisioner();
}
