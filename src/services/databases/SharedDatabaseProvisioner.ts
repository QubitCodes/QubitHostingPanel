export type SharedDatabaseEngine = 'postgresql' | 'mysql';

export interface CreateLogicalDatabaseInput {
	clusterId: string;
	databaseName: string;
	engine: SharedDatabaseEngine;
	username: string;
	workspaceId: string;
}

export interface CreatedLogicalDatabase {
	databaseName: string;
	engine: SharedDatabaseEngine;
	host: string;
	password: string;
	port: number;
	username: string;
}

/** Creates restricted workspace databases inside shared engine clusters. */
export interface SharedDatabaseProvisioner {
	createLogicalDatabase(input: CreateLogicalDatabaseInput): Promise<CreatedLogicalDatabase>;
}
