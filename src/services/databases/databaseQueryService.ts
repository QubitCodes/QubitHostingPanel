import { createHash } from 'node:crypto';
import mysql, { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import pg from 'pg';

import type { DatabaseQueryRequest } from '@schemas/databaseQuery';
import type { DatabaseExplorerConnection } from '@services/databases/databaseExplorerService';

export interface DatabaseQueryResult {
	affectedRows: number;
	columns: string[];
	durationMs: number;
	fingerprint: string;
	readOnly: boolean;
	rows: Array<Record<string, unknown>>;
	statementType: string;
	truncated: boolean;
}

/** Removes values and comments before policy checks; the original SQL is never logged. */
export function queryPolicyView(query: string): string {
	return query
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/--[^\r\n]*/g, ' ')
		.replace(/'(?:''|[^'])*'/g, "''")
		.replace(/"(?:""|[^"])*"/g, '""')
		.replace(/`(?:``|[^`])*`/g, '``')
		.trim();
}

export function databaseQueryPolicy(query: string, allowChanges: boolean): { readOnly: boolean; statementType: string; sql: string } {
	const sql = query.trim().replace(/;\s*$/, '');
	const view = queryPolicyView(query).replace(/;\s*$/, '');
	if (!view || view.includes(';')) throw new Error('Only one SQL statement can be executed at a time.');
	const normalized = view.replace(/\s+/g, ' ').toUpperCase();
	const statementType = normalized.match(/^[A-Z]+/)?.[0] ?? 'UNKNOWN';
	const forbidden = /\b(COPY|LOAD\s+DATA|OUTFILE|DUMPFILE|GRANT|REVOKE|CREATE\s+USER|ALTER\s+USER|DROP\s+USER|RESET|BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK|SAVEPOINT|PREPARE|EXECUTE|DEALLOCATE|LISTEN|NOTIFY|UNLISTEN|LOCK|UNLOCK|RETURNING)\b/;
	if (forbidden.test(normalized)) throw new Error('This statement is not available in the SQL workspace.');
	if (/^SELECT\b[\s\S]*\bINTO\b/.test(normalized)) throw new Error('SELECT INTO is not available in the SQL workspace.');
	const changesData = /\b(INSERT|UPDATE|DELETE|REPLACE|MERGE)\b/.test(normalized);
	const changesStructure = /\b(CREATE|ALTER|DROP|TRUNCATE|RENAME|COMMENT)\b/.test(normalized);
	if (changesStructure) throw new Error('Use Schema Designer for structural database changes.');
	if (changesData && !allowChanges) throw new Error('Enable data changes and confirm the database name before running this statement.');
	const readOnly = !changesData;
	if (!readOnly && !['INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'WITH', 'MERGE'].includes(statementType)) throw new Error('Unsupported data-change statement.');
	if (readOnly && !['SELECT', 'WITH', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC'].includes(statementType)) throw new Error('Only read queries and explicitly confirmed data changes are supported.');
	return { readOnly, statementType, sql };
}

function serialise(value: unknown): unknown {
	if (typeof value === 'bigint') return value.toString();
	if (value instanceof Date) return value.toISOString();
	if (Buffer.isBuffer(value)) return { base64: value.toString('base64'), binary: true, bytes: value.length };
	if (Array.isArray(value)) return value.map(serialise);
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialise(item)]));
	return value;
}

function serialiseRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
	return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, serialise(value)])));
}

/** Executes one bounded tenant query using a read-only transaction unless changes were explicitly enabled. */
export class DatabaseQueryService {
	public constructor(private readonly connection: DatabaseExplorerConnection) {}

	public async execute(input: DatabaseQueryRequest): Promise<DatabaseQueryResult> {
		const policy = databaseQueryPolicy(input.query, input.allowChanges);
		if (!policy.readOnly && input.confirmation !== this.connection.databaseName) throw new Error('Confirmation must exactly match the database name.');
		const started = performance.now();
		const result = this.connection.engine === 'postgresql' ? await this.postgres(policy, input.rowLimit) : await this.mysql(policy, input.rowLimit);
		return { ...result, durationMs: Math.round(performance.now() - started), fingerprint: createHash('sha256').update(policy.sql).digest('hex'), readOnly: policy.readOnly, statementType: policy.statementType };
	}

	private async postgres(policy: ReturnType<typeof databaseQueryPolicy>, rowLimit: number): Promise<Omit<DatabaseQueryResult, 'durationMs' | 'fingerprint' | 'readOnly' | 'statementType'>> {
		const client = new pg.Client({ host: this.connection.host, port: this.connection.port, user: this.connection.username, password: this.connection.password, database: this.connection.databaseName, connectionTimeoutMillis: 8000, ssl: this.connection.tlsMode === 'disabled' ? undefined : { rejectUnauthorized: this.connection.tlsMode === 'verify-full' } });
		await client.connect();
		try {
			await client.query(policy.readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
			await client.query('SET LOCAL statement_timeout = 15000');
			const boundedSql = policy.readOnly && ['SELECT', 'WITH'].includes(policy.statementType) ? `SELECT * FROM (${policy.sql}) AS ghostdeploy_result LIMIT ${rowLimit + 1}` : policy.sql;
			const result = await client.query(boundedSql);
			await client.query('COMMIT');
			const rows = serialiseRows((result.rows ?? []) as Array<Record<string, unknown>>);
			return { affectedRows: result.rowCount ?? 0, columns: result.fields?.map(({ name }) => name) ?? [], rows: rows.slice(0, rowLimit), truncated: rows.length > rowLimit };
		} catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { await client.end(); }
	}

	private async mysql(policy: ReturnType<typeof databaseQueryPolicy>, rowLimit: number): Promise<Omit<DatabaseQueryResult, 'durationMs' | 'fingerprint' | 'readOnly' | 'statementType'>> {
		const connection = await mysql.createConnection({ host: this.connection.host, port: this.connection.port, user: this.connection.username, password: this.connection.password, database: this.connection.databaseName, connectTimeout: 8000, ssl: this.connection.tlsMode === 'disabled' ? undefined : {} });
		try {
			await connection.query(policy.readOnly ? 'START TRANSACTION READ ONLY' : 'START TRANSACTION');
			await connection.query('SET SESSION MAX_EXECUTION_TIME = 15000');
			const boundedSql = policy.readOnly && ['SELECT', 'WITH'].includes(policy.statementType) ? `SELECT * FROM (${policy.sql}) AS ghostdeploy_result LIMIT ${rowLimit + 1}` : policy.sql;
			const [raw, fields] = await connection.query<RowDataPacket[] | ResultSetHeader>(boundedSql);
			await connection.commit();
			if (!Array.isArray(raw)) return { affectedRows: raw.affectedRows, columns: [], rows: [], truncated: false };
			const rows = serialiseRows(raw as Array<Record<string, unknown>>);
			return { affectedRows: rows.length, columns: fields?.map(({ name }) => name) ?? [], rows: rows.slice(0, rowLimit), truncated: rows.length > rowLimit };
		} catch (error) { await connection.rollback().catch(() => undefined); throw error; } finally { await connection.end(); }
	}
}
