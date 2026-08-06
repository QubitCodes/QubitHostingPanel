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

export interface MeasureLogicalDatabaseInput {
	adminDatabase: string;
	adminPassword: string;
	adminUsername: string;
	databaseName: string;
	host: string;
	port: number;
	tlsMode: 'disabled' | 'require' | 'verify-full';
}

export interface DeleteLogicalDatabaseInput extends MeasureLogicalDatabaseInput {
	username: string;
}

/** Creates restricted workspace databases inside shared engine clusters. */
export interface SharedDatabaseProvisioner {
	createLogicalDatabase(input: CreateLogicalDatabaseInput): Promise<CreatedLogicalDatabase>;
	deleteLogicalDatabase(input: DeleteLogicalDatabaseInput): Promise<void>;
	measureLogicalDatabaseBytes(input: MeasureLogicalDatabaseInput): Promise<number>;
	rotateCredential(input: CreateLogicalDatabaseInput & { password: string }): Promise<void>;
}
