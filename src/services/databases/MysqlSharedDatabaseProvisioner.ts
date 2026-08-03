import mysql from 'mysql2/promise';

import type { CreateLogicalDatabaseInput, CreatedLogicalDatabase, SharedDatabaseProvisioner } from '@services/databases/SharedDatabaseProvisioner';

const identifier = (value: string): string => `\`${value.replaceAll('`', '``')}\``;

/** Provisions one MySQL database and a login restricted to that database. */
export class MysqlSharedDatabaseProvisioner implements SharedDatabaseProvisioner {
	public async createLogicalDatabase(input: CreateLogicalDatabaseInput): Promise<CreatedLogicalDatabase> {
		const admin = await mysql.createConnection({ host: input.host, port: input.port, database: input.adminDatabase, user: input.adminUsername, password: input.adminPassword, connectTimeout: 15_000 });
		try {
			await admin.query(`CREATE DATABASE ${identifier(input.databaseName)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
			await admin.query(`CREATE USER ?@'%' IDENTIFIED BY ?`, [input.username, input.password]);
			await admin.query(`GRANT ALL PRIVILEGES ON ${identifier(input.databaseName)}.* TO ?@'%'`, [input.username]);
		} catch (error) {
			await admin.query(`DROP DATABASE IF EXISTS ${identifier(input.databaseName)}`).catch(() => undefined);
			await admin.query(`DROP USER IF EXISTS ?@'%'`, [input.username]).catch(() => undefined);
			throw error;
		} finally { await admin.end(); }
		return { databaseName: input.databaseName, engine: 'mysql', host: input.host, password: input.password, port: input.port, username: input.username };
	}

	public async rotateCredential(input: CreateLogicalDatabaseInput & { password: string }): Promise<void> {
		const admin = await mysql.createConnection({ host: input.host, port: input.port, database: input.adminDatabase, user: input.adminUsername, password: input.adminPassword, connectTimeout: 15_000 });
		try { await admin.query(`ALTER USER ?@'%' IDENTIFIED BY ?`, [input.username, input.password]); }
		finally { await admin.end(); }
	}
}
