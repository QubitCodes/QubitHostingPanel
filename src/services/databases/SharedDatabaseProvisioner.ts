export type SharedDatabaseEngine = 'postgresql' | 'mysql';

export interface CreateLogicalDatabaseInput {
	adminDatabase: string;
	adminPassword: string;
	adminUsername: string;
	connectionLimit?: number;
	databaseName: string;
	engine: SharedDatabaseEngine;
	host: string;
	port: number;
	password: string;
	tlsMode: 'disabled' | 'require' | 'verify-full';
	username: string;
	workspaceId: string;
}

export interface CreatedLogicalDatabase {
	databaseName: string;
	engine: SharedDatabaseEngine;
	host: string;
	password: string;
	port: number;
	tlsMode: 'disabled' | 'require' | 'verify-full';
	username: string;
}

/** Creates restricted workspace databases inside shared engine clusters. */
export interface SharedDatabaseProvisioner {
	createLogicalDatabase(input: CreateLogicalDatabaseInput): Promise<CreatedLogicalDatabase>;
	rotateCredential(input: CreateLogicalDatabaseInput & { password: string }): Promise<void>;
}
