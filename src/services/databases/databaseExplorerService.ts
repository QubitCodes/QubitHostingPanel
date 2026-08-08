import mysql, { type RowDataPacket } from 'mysql2/promise';
import pg from 'pg';

import type { DatabaseExplorerDeleteRows, DatabaseExplorerInsertRow, DatabaseExplorerRowsQuery, DatabaseExplorerUpdateRow } from '@schemas/databaseExplorer';

export interface DatabaseExplorerConnection {
	databaseName: string;
	engine: 'mysql' | 'postgresql';
	host: string;
	password: string;
	port: number;
	tlsMode: 'disabled' | 'require' | 'verify-full';
	username: string;
}

export interface DatabaseObjectSummary {
	estimatedRows: number | null;
	kind: 'materialized_view' | 'table' | 'view';
	name: string;
	schema: string;
}

export interface DatabaseColumn {
	dataType: string;
	defaultValue: string | null;
	isGenerated: boolean;
	isIdentity: boolean;
	isNullable: boolean;
	isPrimaryKey: boolean;
	name: string;
	ordinal: number;
}

export interface DatabaseIndex {
	definition: string;
	isPrimary: boolean;
	isUnique: boolean;
	name: string;
}

export interface DatabaseConstraint {
	columns: string[];
	definition: string;
	name: string;
	referenceColumns: string[];
	referenceSchema: string | null;
	referenceTable: string | null;
	type: 'check' | 'foreign_key' | 'primary_key' | 'unique';
}

export interface DatabaseObjectStructure {
	columns: DatabaseColumn[];
	constraints: DatabaseConstraint[];
	indexes: DatabaseIndex[];
	kind: DatabaseObjectSummary['kind'];
	name: string;
	schema: string;
}

export interface DatabaseRowsResult {
	columns: DatabaseColumn[];
	page: number;
	pageSize: number;
	rows: Array<Record<string, unknown>>;
	sortColumn: string | null;
	sortDirection: 'asc' | 'desc';
	totalRows: number;
}

export interface DatabaseAdvancedObject {
	definition: string | null;
	kind: 'event' | 'function' | 'materialized_view' | 'procedure' | 'sequence' | 'trigger' | 'view';
	name: string;
	schema: string;
	tableName: string | null;
}

const postgresIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;
const mysqlIdentifier = (value: string): string => `\`${value.replaceAll('`', '``')}\``;

/** Converts driver-specific values into deterministic JSON-safe values. */
function serialiseValue(value: unknown): unknown {
	if (typeof value === 'bigint') return value.toString();
	if (value instanceof Date) return value.toISOString();
	if (Buffer.isBuffer(value)) return { binary: true, base64: value.toString('base64'), bytes: value.length };
	if (Array.isArray(value)) return value.map(serialiseValue);
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serialiseValue(nested)]));
	return value;
}

function serialiseRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
	return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, serialiseValue(value)])));
}

type MysqlBindableValue = boolean | Buffer | Date | null | number | string;

/** Normalizes browser JSON values into the primitive bindings supported by mysql2. */
function mysqlBindableValues(values: unknown[]): MysqlBindableValue[] {
	return values.map((value) => {
		if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date || Buffer.isBuffer(value)) return value;
		return JSON.stringify(value);
	});
}

/** Provides read-only, tenant-scoped schema and row inspection for PostgreSQL and MySQL. */
export class DatabaseExplorerService {
	public constructor(private readonly connection: DatabaseExplorerConnection) {}

	/** Lists tenant-visible schemas, including empty PostgreSQL schemas. */
	public async listSchemas(): Promise<string[]> {
		if (this.connection.engine === 'mysql') return [this.connection.databaseName];
		const client = this.postgresClient();
		await client.connect();
		try {
			await client.query('SET statement_timeout = 8000');
			const result = await client.query<{ schema: string }>(`
				SELECT namespace.nspname AS schema
				FROM pg_catalog.pg_namespace namespace
				WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
					AND namespace.nspname NOT LIKE 'pg_toast%'
				ORDER BY namespace.nspname
			`);
			return result.rows.map(({ schema }) => schema);
		} finally {
			await client.end();
		}
	}

	public async listObjects(): Promise<DatabaseObjectSummary[]> {
		return this.connection.engine === 'postgresql' ? this.listPostgresObjects() : this.listMysqlObjects();
	}

	/** Lists programmable and supporting objects without allowing arbitrary SQL. */
	public async listAdvancedObjects(): Promise<DatabaseAdvancedObject[]> {
		return this.connection.engine === 'postgresql'
			? this.listPostgresAdvancedObjects()
			: this.listMysqlAdvancedObjects();
	}

	public async describeObject(schema: string, table: string): Promise<DatabaseObjectStructure> {
		const object = (await this.listObjects()).find((item) => item.schema === schema && item.name === table);
		if (!object) throw new Error('Database object not found.');
		const detail = this.connection.engine === 'postgresql'
			? await this.describePostgresObject(schema, table)
			: await this.describeMysqlObject(schema, table);
		return { ...detail, kind: object.kind, name: table, schema };
	}

	public async listRows(input: DatabaseExplorerRowsQuery): Promise<DatabaseRowsResult> {
		const structure = await this.describeObject(input.schema, input.table);
		if (!structure.columns.length) throw new Error('The selected object has no readable columns.');
		const columnNames = new Set(structure.columns.map(({ name }) => name));
		if (input.sortColumn && !columnNames.has(input.sortColumn)) throw new Error('Sort column not found.');
		if (input.searchColumn && !columnNames.has(input.searchColumn)) throw new Error('Search column not found.');
		const primary = structure.columns.find(({ isPrimaryKey }) => isPrimaryKey)?.name;
		const sortColumn = input.sortColumn ?? primary ?? structure.columns[0]?.name ?? null;
		const result = this.connection.engine === 'postgresql'
			? await this.listPostgresRows(input, sortColumn)
			: await this.listMysqlRows(input, sortColumn);
		return { ...result, columns: structure.columns, page: input.page, pageSize: input.pageSize, sortColumn, sortDirection: input.sortDirection };
	}

	public async insertRow(input: DatabaseExplorerInsertRow): Promise<{ affectedRows: number }> {
		const structure = await this.writableStructure(input.schema, input.table, false);
		const columns = this.writableColumns(structure, input.values, 'insert');
		return this.connection.engine === 'postgresql'
			? this.insertPostgresRow(input.schema, input.table, columns, input.values)
			: this.insertMysqlRow(input.schema, input.table, columns, input.values);
	}

	public async updateRow(input: DatabaseExplorerUpdateRow): Promise<{ affectedRows: number }> {
		const structure = await this.writableStructure(input.schema, input.table);
		const primaryColumns = this.primaryKeyColumns(structure, input.key);
		const columns = this.writableColumns(structure, input.values, 'update');
		return this.connection.engine === 'postgresql'
			? this.updatePostgresRow(input.schema, input.table, primaryColumns, input.key, columns, input.values)
			: this.updateMysqlRow(input.schema, input.table, primaryColumns, input.key, columns, input.values);
	}

	public async deleteRows(input: DatabaseExplorerDeleteRows): Promise<{ affectedRows: number }> {
		const structure = await this.writableStructure(input.schema, input.table);
		const primaryColumns = structure.columns.filter(({ isPrimaryKey }) => isPrimaryKey).map(({ name }) => name);
		for (const key of input.keys) this.primaryKeyColumns(structure, key);
		return this.connection.engine === 'postgresql'
			? this.deletePostgresRows(input.schema, input.table, primaryColumns, input.keys)
			: this.deleteMysqlRows(input.schema, input.table, primaryColumns, input.keys);
	}

	private async writableStructure(schema: string, table: string, requirePrimaryKey = true): Promise<DatabaseObjectStructure> {
		const structure = await this.describeObject(schema, table);
		if (structure.kind !== 'table') throw new Error('Views are read-only in the database explorer.');
		if (requirePrimaryKey && !structure.columns.some(({ isPrimaryKey }) => isPrimaryKey)) throw new Error('Row changes require a primary key.');
		return structure;
	}

	private primaryKeyColumns(structure: DatabaseObjectStructure, key: Record<string, unknown>): string[] {
		const primaryColumns = structure.columns.filter(({ isPrimaryKey }) => isPrimaryKey).map(({ name }) => name);
		if (primaryColumns.some((column) => !Object.hasOwn(key, column)) || Object.keys(key).some((column) => !primaryColumns.includes(column))) throw new Error('A complete primary key is required.');
		return primaryColumns;
	}

	private writableColumns(structure: DatabaseObjectStructure, values: Record<string, unknown>, operation: 'insert' | 'update'): string[] {
		const columns = Object.keys(values);
		for (const name of columns) {
			const column = structure.columns.find((candidate) => candidate.name === name);
			if (!column) throw new Error(`Column ${name} was not found.`);
			if (column.isGenerated || column.isIdentity || (operation === 'update' && column.isPrimaryKey)) throw new Error(`Column ${name} cannot be changed.`);
		}
		return columns;
	}

	private postgresClient(): pg.Client {
		return new pg.Client({
			host: this.connection.host,
			port: this.connection.port,
			database: this.connection.databaseName,
			user: this.connection.username,
			password: this.connection.password,
			ssl: this.connection.tlsMode === 'disabled' ? false : { rejectUnauthorized: this.connection.tlsMode === 'verify-full' },
			connectionTimeoutMillis: 10_000,
		});
	}

	private async mysqlClient(): Promise<mysql.Connection> {
		const connection = await mysql.createConnection({
			host: this.connection.host,
			port: this.connection.port,
			database: this.connection.databaseName,
			user: this.connection.username,
			password: this.connection.password,
			ssl: this.connection.tlsMode === 'disabled' ? undefined : { rejectUnauthorized: this.connection.tlsMode === 'verify-full' },
			connectTimeout: 10_000,
		});
		await connection.query('SET SESSION MAX_EXECUTION_TIME = 8000');
		return connection;
	}

	private async listPostgresObjects(): Promise<DatabaseObjectSummary[]> {
		const client = this.postgresClient();
		await client.connect();
		try {
			await client.query('SET statement_timeout = 8000');
			const result = await client.query<{ estimated_rows: string; kind: DatabaseObjectSummary['kind']; name: string; schema: string }>(`
				SELECT namespace.nspname AS schema, class.relname AS name,
					CASE class.relkind WHEN 'm' THEN 'materialized_view' WHEN 'v' THEN 'view' ELSE 'table' END AS kind,
					GREATEST(class.reltuples, 0)::bigint::text AS estimated_rows
				FROM pg_catalog.pg_class class
				JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
				WHERE class.relkind IN ('r', 'p', 'v', 'm', 'f')
					AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
					AND namespace.nspname NOT LIKE 'pg_toast%'
				ORDER BY namespace.nspname, class.relname
			`);
			return result.rows.map((row) => ({ ...row, estimatedRows: row.kind === 'table' ? Number(row.estimated_rows) : null }));
		} finally {
			await client.end();
		}
	}

	private async listMysqlObjects(): Promise<DatabaseObjectSummary[]> {
		const client = await this.mysqlClient();
		try {
			const [rows] = await client.query<RowDataPacket[]>(`
				SELECT table_schema AS object_schema, table_name AS object_name, table_type, table_rows
				FROM information_schema.tables
				WHERE table_schema = ?
				ORDER BY table_name
			`, [this.connection.databaseName]);
			return rows.map((row) => ({
				schema: String(row.object_schema),
				name: String(row.object_name),
				kind: String(row.table_type) === 'VIEW' ? 'view' : 'table',
				estimatedRows: String(row.table_type) === 'VIEW' ? null : Number(row.table_rows ?? 0),
			}));
		} finally {
			await client.end();
		}
	}

	private async listPostgresAdvancedObjects(): Promise<DatabaseAdvancedObject[]> {
		const client = this.postgresClient();
		await client.connect();
		try {
			await client.query('SET statement_timeout = 8000');
			const routines = await client.query<{ definition: string; kind: 'function' | 'procedure'; name: string; schema: string }>(`
				SELECT namespace.nspname AS schema, procedure.proname AS name,
					CASE procedure.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS kind,
					pg_catalog.pg_get_functiondef(procedure.oid) AS definition
				FROM pg_catalog.pg_proc procedure
				JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
				WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
					AND namespace.nspname NOT LIKE 'pg_toast%'
					AND procedure.prokind IN ('f', 'p')
				ORDER BY namespace.nspname, procedure.proname
			`);
			const triggers = await client.query<{ definition: string; name: string; schema: string; table_name: string }>(`
				SELECT namespace.nspname AS schema, trigger.tgname AS name, class.relname AS table_name,
					pg_catalog.pg_get_triggerdef(trigger.oid, true) AS definition
				FROM pg_catalog.pg_trigger trigger
				JOIN pg_catalog.pg_class class ON class.oid = trigger.tgrelid
				JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
				WHERE NOT trigger.tgisinternal
					AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
				ORDER BY namespace.nspname, class.relname, trigger.tgname
			`);
			const sequences = await client.query<{ name: string; schema: string }>(`
				SELECT sequence_schema AS schema, sequence_name AS name
				FROM information_schema.sequences
				WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
				ORDER BY sequence_schema, sequence_name
			`);
			const views = await client.query<{ definition: string; kind: 'materialized_view' | 'view'; name: string; schema: string }>(`
				SELECT namespace.nspname AS schema, class.relname AS name,
					CASE class.relkind WHEN 'm' THEN 'materialized_view' ELSE 'view' END AS kind,
					pg_catalog.pg_get_viewdef(class.oid, true) AS definition
				FROM pg_catalog.pg_class class
				JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
				WHERE class.relkind IN ('v', 'm')
					AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
				ORDER BY namespace.nspname, class.relname
			`);
			return [
				...views.rows.map((row) => ({ ...row, tableName: null })),
				...routines.rows.map((row) => ({ ...row, tableName: null })),
				...triggers.rows.map((row) => ({ definition: row.definition, kind: 'trigger' as const, name: row.name, schema: row.schema, tableName: row.table_name })),
				...sequences.rows.map((row) => ({ definition: null, kind: 'sequence' as const, name: row.name, schema: row.schema, tableName: null })),
			];
		} finally {
			await client.end();
		}
	}

	private async listMysqlAdvancedObjects(): Promise<DatabaseAdvancedObject[]> {
		const client = await this.mysqlClient();
		try {
			const [routines] = await client.query<RowDataPacket[]>(`
				SELECT routine_schema, routine_name, routine_type, routine_definition
				FROM information_schema.routines WHERE routine_schema = ? ORDER BY routine_name
			`, [this.connection.databaseName]);
			const [triggers] = await client.query<RowDataPacket[]>(`
				SELECT trigger_schema, trigger_name, event_object_table, action_statement
				FROM information_schema.triggers WHERE trigger_schema = ? ORDER BY trigger_name
			`, [this.connection.databaseName]);
			const [events] = await client.query<RowDataPacket[]>(`
				SELECT event_schema, event_name, event_definition
				FROM information_schema.events WHERE event_schema = ? ORDER BY event_name
			`, [this.connection.databaseName]);
			const [views] = await client.query<RowDataPacket[]>(`
				SELECT table_schema, table_name, view_definition
				FROM information_schema.views WHERE table_schema = ? ORDER BY table_name
			`, [this.connection.databaseName]);
			return [
				...views.map((row) => ({ definition: row.view_definition === null ? null : String(row.view_definition), kind: 'view' as const, name: String(row.table_name), schema: String(row.table_schema), tableName: null })),
				...routines.map((row) => ({ definition: row.routine_definition === null ? null : String(row.routine_definition), kind: String(row.routine_type).toLowerCase() as 'function' | 'procedure', name: String(row.routine_name), schema: String(row.routine_schema), tableName: null })),
				...triggers.map((row) => ({ definition: row.action_statement === null ? null : String(row.action_statement), kind: 'trigger' as const, name: String(row.trigger_name), schema: String(row.trigger_schema), tableName: String(row.event_object_table) })),
				...events.map((row) => ({ definition: row.event_definition === null ? null : String(row.event_definition), kind: 'event' as const, name: String(row.event_name), schema: String(row.event_schema), tableName: null })),
			];
		} finally {
			await client.end();
		}
	}

	private async describePostgresObject(schema: string, table: string): Promise<Omit<DatabaseObjectStructure, 'kind' | 'name' | 'schema'>> {
		const client = this.postgresClient();
		await client.connect();
		try {
			await client.query('SET statement_timeout = 8000');
			const columns = await client.query<{
				column_default: string | null; column_name: string; data_type: string; is_generated: string; is_identity: string; is_nullable: string; is_primary: boolean; ordinal_position: number; udt_name: string;
			}>(`
				SELECT column_info.column_name, column_info.data_type, column_info.udt_name,
					column_info.is_nullable, column_info.column_default, column_info.ordinal_position,
					column_info.is_identity, column_info.is_generated,
					EXISTS (
						SELECT 1 FROM pg_catalog.pg_constraint constraint_info
						JOIN pg_catalog.pg_class class ON class.oid = constraint_info.conrelid
						JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
						JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = class.oid AND attribute.attnum = ANY(constraint_info.conkey)
						WHERE constraint_info.contype = 'p' AND namespace.nspname = column_info.table_schema
							AND class.relname = column_info.table_name AND attribute.attname = column_info.column_name
					) AS is_primary
				FROM information_schema.columns column_info
				WHERE column_info.table_schema = $1 AND column_info.table_name = $2
				ORDER BY column_info.ordinal_position
			`, [schema, table]);
			const indexes = await client.query<{ definition: string; name: string }>(`
				SELECT indexname AS name, indexdef AS definition
				FROM pg_catalog.pg_indexes WHERE schemaname = $1 AND tablename = $2 ORDER BY indexname
			`, [schema, table]);
			const constraints = await client.query<{
				columns: string[] | null;
				definition: string;
				name: string;
				reference_columns: string[] | null;
				reference_schema: string | null;
				reference_table: string | null;
				type: DatabaseConstraint['type'];
			}>(`
				SELECT constraint_info.conname AS name,
					CASE constraint_info.contype WHEN 'p' THEN 'primary_key' WHEN 'f' THEN 'foreign_key' WHEN 'u' THEN 'unique' ELSE 'check' END AS type,
					pg_catalog.pg_get_constraintdef(constraint_info.oid, true) AS definition,
					ARRAY(SELECT attribute.attname FROM unnest(constraint_info.conkey) WITH ORDINALITY key(attnum, position)
						JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = constraint_info.conrelid AND attribute.attnum = key.attnum ORDER BY key.position) AS columns,
					reference_namespace.nspname AS reference_schema, reference_class.relname AS reference_table,
					ARRAY(SELECT attribute.attname FROM unnest(constraint_info.confkey) WITH ORDINALITY key(attnum, position)
						JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = constraint_info.confrelid AND attribute.attnum = key.attnum ORDER BY key.position) AS reference_columns
				FROM pg_catalog.pg_constraint constraint_info
				JOIN pg_catalog.pg_class class ON class.oid = constraint_info.conrelid
				JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
				LEFT JOIN pg_catalog.pg_class reference_class ON reference_class.oid = constraint_info.confrelid
				LEFT JOIN pg_catalog.pg_namespace reference_namespace ON reference_namespace.oid = reference_class.relnamespace
				WHERE namespace.nspname = $1 AND class.relname = $2 AND constraint_info.contype IN ('p', 'f', 'u', 'c')
				ORDER BY constraint_info.conname
			`, [schema, table]);
			return {
				columns: columns.rows.map((column) => ({
					name: column.column_name,
					dataType: column.data_type === 'USER-DEFINED' ? column.udt_name : column.data_type,
					isNullable: column.is_nullable === 'YES',
					defaultValue: column.column_default,
					ordinal: Number(column.ordinal_position),
					isPrimaryKey: column.is_primary,
					isIdentity: column.is_identity === 'YES',
					isGenerated: column.is_generated !== 'NEVER',
				})),
				constraints: constraints.rows.map((constraint) => ({
					columns: constraint.columns ?? [],
					definition: constraint.definition,
					name: constraint.name,
					referenceColumns: constraint.reference_columns ?? [],
					referenceSchema: constraint.reference_schema,
					referenceTable: constraint.reference_table,
					type: constraint.type,
				})),
				indexes: indexes.rows.map((index) => ({ name: index.name, definition: index.definition, isPrimary: index.definition.includes('PRIMARY KEY'), isUnique: index.definition.includes(' UNIQUE ') })),
			};
		} finally {
			await client.end();
		}
	}

	private async describeMysqlObject(schema: string, table: string): Promise<Omit<DatabaseObjectStructure, 'kind' | 'name' | 'schema'>> {
		if (schema !== this.connection.databaseName) throw new Error('Database object not found.');
		const client = await this.mysqlClient();
		try {
			const [columnRows] = await client.query<RowDataPacket[]>(`
				SELECT column_name, column_type, is_nullable, column_default, ordinal_position, column_key, extra, generation_expression
				FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position
			`, [schema, table]);
			const [indexRows] = await client.query<RowDataPacket[]>('SHOW INDEX FROM ' + mysqlIdentifier(table) + ' FROM ' + mysqlIdentifier(schema));
			const [constraintRows] = await client.query<RowDataPacket[]>(`
				SELECT constraints.constraint_name, constraints.constraint_type,
					GROUP_CONCAT(keys.column_name ORDER BY keys.ordinal_position) AS object_columns,
					MAX(keys.referenced_table_schema) AS reference_schema,
					MAX(keys.referenced_table_name) AS reference_table,
					GROUP_CONCAT(keys.referenced_column_name ORDER BY keys.ordinal_position) AS reference_columns
				FROM information_schema.table_constraints constraints
				LEFT JOIN information_schema.key_column_usage keys
					ON keys.constraint_schema = constraints.constraint_schema AND keys.table_name = constraints.table_name AND keys.constraint_name = constraints.constraint_name
				WHERE constraints.constraint_schema = ? AND constraints.table_name = ?
				GROUP BY constraints.constraint_name, constraints.constraint_type
				ORDER BY constraints.constraint_name
			`, [schema, table]);
			const indexes = new Map<string, { columns: string[]; isPrimary: boolean; isUnique: boolean }>();
			for (const row of indexRows) {
				const name = String(row.Key_name);
				const current = indexes.get(name) ?? { columns: [], isPrimary: name === 'PRIMARY', isUnique: Number(row.Non_unique) === 0 };
				current.columns.push(String(row.Column_name));
				indexes.set(name, current);
			}
			return {
				columns: columnRows.map((column) => ({
					name: String(column.column_name), dataType: String(column.column_type), isNullable: String(column.is_nullable) === 'YES', defaultValue: column.column_default === null ? null : String(column.column_default), ordinal: Number(column.ordinal_position), isPrimaryKey: String(column.column_key) === 'PRI', isIdentity: String(column.extra).includes('auto_increment'), isGenerated: Boolean(column.generation_expression),
				})),
				constraints: constraintRows.map((row) => {
					const type = String(row.constraint_type);
					const columns = row.object_columns ? String(row.object_columns).split(',') : [];
					const referenceColumns = row.reference_columns ? String(row.reference_columns).split(',') : [];
					const referenceSchema = row.reference_schema ? String(row.reference_schema) : null;
					const referenceTable = row.reference_table ? String(row.reference_table) : null;
					return {
						columns,
						definition: referenceTable ? `FOREIGN KEY (${columns.join(', ')}) REFERENCES ${referenceSchema}.${referenceTable} (${referenceColumns.join(', ')})` : `${type} (${columns.join(', ')})`,
						name: String(row.constraint_name),
						referenceColumns,
						referenceSchema,
						referenceTable,
						type: type === 'PRIMARY KEY' ? 'primary_key' as const : type === 'FOREIGN KEY' ? 'foreign_key' as const : type === 'UNIQUE' ? 'unique' as const : 'check' as const,
					};
				}),
				indexes: [...indexes.entries()].map(([name, index]) => ({ name, definition: `(${index.columns.join(', ')})`, isPrimary: index.isPrimary, isUnique: index.isUnique })),
			};
		} finally {
			await client.end();
		}
	}

	private async listPostgresRows(input: DatabaseExplorerRowsQuery, sortColumn: string | null): Promise<Pick<DatabaseRowsResult, 'rows' | 'totalRows'>> {
		const client = this.postgresClient();
		await client.connect();
		try {
			await client.query('SET statement_timeout = 8000');
			const relation = `${postgresIdentifier(input.schema)}.${postgresIdentifier(input.table)}`;
			const values: unknown[] = [];
			const where = input.search && input.searchColumn ? ` WHERE CAST(${postgresIdentifier(input.searchColumn)} AS TEXT) ILIKE $${values.push(`%${input.search}%`)}` : '';
			const countResult = await client.query<{ total: string }>(`SELECT count(*)::text AS total FROM ${relation}${where}`, values);
			const limitPosition = values.push(input.pageSize);
			const offsetPosition = values.push((input.page - 1) * input.pageSize);
			const order = sortColumn ? ` ORDER BY ${postgresIdentifier(sortColumn)} ${input.sortDirection.toUpperCase()}` : '';
			const rows = await client.query<Record<string, unknown>>(`SELECT * FROM ${relation}${where}${order} LIMIT $${limitPosition} OFFSET $${offsetPosition}`, values);
			return { rows: serialiseRows(rows.rows), totalRows: Number(countResult.rows[0]?.total ?? 0) };
		} finally {
			await client.end();
		}
	}

	private async listMysqlRows(input: DatabaseExplorerRowsQuery, sortColumn: string | null): Promise<Pick<DatabaseRowsResult, 'rows' | 'totalRows'>> {
		const client = await this.mysqlClient();
		try {
			const relation = `${mysqlIdentifier(input.schema)}.${mysqlIdentifier(input.table)}`;
			const values: unknown[] = [];
			const where = input.search && input.searchColumn ? ` WHERE CAST(${mysqlIdentifier(input.searchColumn)} AS CHAR) LIKE ?` : '';
			if (where) values.push(`%${input.search}%`);
			const [countRows] = await client.query<RowDataPacket[]>(`SELECT count(*) AS total FROM ${relation}${where}`, values);
			const order = sortColumn ? ` ORDER BY ${mysqlIdentifier(sortColumn)} ${input.sortDirection.toUpperCase()}` : '';
			const [rows] = await client.query<RowDataPacket[]>(`SELECT * FROM ${relation}${where}${order} LIMIT ? OFFSET ?`, [...values, input.pageSize, (input.page - 1) * input.pageSize]);
			return { rows: serialiseRows(rows as Array<Record<string, unknown>>), totalRows: Number(countRows[0]?.total ?? 0) };
		} finally {
			await client.end();
		}
	}

	private async insertPostgresRow(schema: string, table: string, columns: string[], values: Record<string, unknown>): Promise<{ affectedRows: number }> {
		const client = this.postgresClient();
		await client.connect();
		try {
			await client.query('BEGIN');
			await client.query('SET LOCAL statement_timeout = 8000');
			const parameters = columns.map((_, index) => `$${index + 1}`).join(', ');
			const relation = `${postgresIdentifier(schema)}.${postgresIdentifier(table)}`;
			const result = columns.length
				? await client.query(`INSERT INTO ${relation} (${columns.map(postgresIdentifier).join(', ')}) VALUES (${parameters})`, columns.map((column) => values[column]))
				: await client.query(`INSERT INTO ${relation} DEFAULT VALUES`);
			await client.query('COMMIT');
			return { affectedRows: result.rowCount ?? 0 };
		} catch (error) {
			await client.query('ROLLBACK').catch(() => undefined);
			throw error;
		} finally { await client.end(); }
	}

	private async insertMysqlRow(schema: string, table: string, columns: string[], values: Record<string, unknown>): Promise<{ affectedRows: number }> {
		const client = await this.mysqlClient();
		try {
			await client.beginTransaction();
			const relation = `${mysqlIdentifier(schema)}.${mysqlIdentifier(table)}`;
			const [result] = columns.length
				? await client.execute<mysql.ResultSetHeader>(`INSERT INTO ${relation} (${columns.map(mysqlIdentifier).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, mysqlBindableValues(columns.map((column) => values[column])))
				: await client.execute<mysql.ResultSetHeader>(`INSERT INTO ${relation} () VALUES ()`);
			await client.commit();
			return { affectedRows: result.affectedRows };
		} catch (error) {
			await client.rollback().catch(() => undefined);
			throw error;
		} finally { await client.end(); }
	}

	private async updatePostgresRow(schema: string, table: string, primaryColumns: string[], key: Record<string, unknown>, columns: string[], values: Record<string, unknown>): Promise<{ affectedRows: number }> {
		const client = this.postgresClient();
		await client.connect();
		try {
			await client.query('BEGIN');
			await client.query('SET LOCAL statement_timeout = 8000');
			const parameters = columns.map((column) => values[column]);
			const assignments = columns.map((column, index) => `${postgresIdentifier(column)} = $${index + 1}`).join(', ');
			const where = primaryColumns.map((column) => `${postgresIdentifier(column)} IS NOT DISTINCT FROM $${parameters.push(key[column])}`).join(' AND ');
			const result = await client.query(`UPDATE ${postgresIdentifier(schema)}.${postgresIdentifier(table)} SET ${assignments} WHERE ${where}`, parameters);
			await client.query('COMMIT');
			return { affectedRows: result.rowCount ?? 0 };
		} catch (error) {
			await client.query('ROLLBACK').catch(() => undefined);
			throw error;
		} finally { await client.end(); }
	}

	private async updateMysqlRow(schema: string, table: string, primaryColumns: string[], key: Record<string, unknown>, columns: string[], values: Record<string, unknown>): Promise<{ affectedRows: number }> {
		const client = await this.mysqlClient();
		try {
			await client.beginTransaction();
			const assignments = columns.map((column) => `${mysqlIdentifier(column)} = ?`).join(', ');
			const where = primaryColumns.map((column) => `${mysqlIdentifier(column)} <=> ?`).join(' AND ');
			const [result] = await client.execute<mysql.ResultSetHeader>(`UPDATE ${mysqlIdentifier(schema)}.${mysqlIdentifier(table)} SET ${assignments} WHERE ${where}`, mysqlBindableValues([...columns.map((column) => values[column]), ...primaryColumns.map((column) => key[column])]));
			await client.commit();
			return { affectedRows: result.affectedRows };
		} catch (error) {
			await client.rollback().catch(() => undefined);
			throw error;
		} finally { await client.end(); }
	}

	private async deletePostgresRows(schema: string, table: string, primaryColumns: string[], keys: Array<Record<string, unknown>>): Promise<{ affectedRows: number }> {
		const client = this.postgresClient();
		await client.connect();
		try {
			await client.query('BEGIN');
			await client.query('SET LOCAL statement_timeout = 8000');
			const parameters: unknown[] = [];
			const where = keys.map((key) => `(${primaryColumns.map((column) => `${postgresIdentifier(column)} IS NOT DISTINCT FROM $${parameters.push(key[column])}`).join(' AND ')})`).join(' OR ');
			const result = await client.query(`DELETE FROM ${postgresIdentifier(schema)}.${postgresIdentifier(table)} WHERE ${where}`, parameters);
			await client.query('COMMIT');
			return { affectedRows: result.rowCount ?? 0 };
		} catch (error) {
			await client.query('ROLLBACK').catch(() => undefined);
			throw error;
		} finally { await client.end(); }
	}

	private async deleteMysqlRows(schema: string, table: string, primaryColumns: string[], keys: Array<Record<string, unknown>>): Promise<{ affectedRows: number }> {
		const client = await this.mysqlClient();
		try {
			await client.beginTransaction();
			const parameters: unknown[] = [];
			const where = keys.map((key) => `(${primaryColumns.map((column) => { parameters.push(key[column]); return `${mysqlIdentifier(column)} <=> ?`; }).join(' AND ')})`).join(' OR ');
			const [result] = await client.execute<mysql.ResultSetHeader>(`DELETE FROM ${mysqlIdentifier(schema)}.${mysqlIdentifier(table)} WHERE ${where}`, mysqlBindableValues(parameters));
			await client.commit();
			return { affectedRows: result.affectedRows };
		} catch (error) {
			await client.rollback().catch(() => undefined);
			throw error;
		} finally { await client.end(); }
	}
}
