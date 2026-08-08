import mysql from 'mysql2/promise';
import pg from 'pg';

import type { DatabaseAdvancedObjectMutation } from '@schemas/databaseExplorer';
import type { DatabaseExplorerConnection } from '@services/databases/databaseExplorerService';

function identifier(value: string, engine: DatabaseExplorerConnection['engine']): string {
	if (!/^[A-Za-z_][A-Za-z0-9_$]{0,127}$/.test(value)) throw new Error('Object identifiers contain unsupported characters.');
	return engine === 'postgresql' ? `"${value}"` : `\`${value}\``;
}

function normalizedDefinition(definition: string): string {
	const normalized = definition.trim().replace(/;\s*$/, '');
	if (!normalized) throw new Error('Object definition is required.');
	if (/\b(GRANT|REVOKE|CREATE\s+(?:USER|ROLE|DATABASE|TABLESPACE)|ALTER\s+(?:USER|ROLE|SYSTEM|DATABASE)|DROP\s+(?:USER|ROLE|DATABASE|TABLESPACE)|COPY\b[\s\S]*\bPROGRAM\b|LOAD_FILE|INTO\s+(?:OUTFILE|DUMPFILE)|INSTALL\s+PLUGIN|UNINSTALL\s+PLUGIN|SET\s+GLOBAL)\b/i.test(normalized)) throw new Error('Administrative, filesystem, and server-wide statements are not available.');
	return normalized;
}

function exactNamePattern(schema: string, name: string): string {
	const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return `(?:["\x60]?${escape(schema)}["\x60]?\\s*\\.\\s*)?["\x60]?${escape(name)}["\x60]?`;
}

/** Converts a modelled advanced-object request into engine-scoped DDL. */
export function advancedObjectStatements(engine: DatabaseExplorerConnection['engine'], input: DatabaseAdvancedObjectMutation): string[] {
	const schema = identifier(input.schema, engine); const name = identifier(input.name, engine); const qualified = `${schema}.${name}`;
	if (engine === 'mysql' && input.schema !== input.schema.trim()) throw new Error('MySQL object schema is invalid.');
	if (input.operation === 'refresh') {
		if (engine !== 'postgresql') throw new Error('Materialized views are available only on PostgreSQL.');
		return [`REFRESH MATERIALIZED VIEW ${qualified}`];
	}
	if (input.operation === 'drop') {
		if (input.kind === 'materialized_view') { if (engine !== 'postgresql') throw new Error('Materialized views are available only on PostgreSQL.'); return [`DROP MATERIALIZED VIEW ${qualified}`]; }
		if (input.kind === 'sequence') { if (engine !== 'postgresql') throw new Error('Sequences are available only on PostgreSQL.'); return [`DROP SEQUENCE ${qualified}`]; }
		if (input.kind === 'event') { if (engine !== 'mysql') throw new Error('Events are available only on MySQL.'); return [`DROP EVENT ${qualified}`]; }
		if (input.kind === 'trigger') return [`DROP TRIGGER ${qualified}`];
		if (input.kind === 'function' || input.kind === 'procedure') { const signature = input.signature?.trim() ?? ''; if (engine === 'postgresql' && signature && !/^[A-Za-z0-9_\s,."[\]]+$/.test(signature)) throw new Error('Routine signature contains unsupported characters.'); return [`DROP ${input.kind.toUpperCase()} ${qualified}${engine === 'postgresql' ? `(${signature})` : ''}`]; }
		return [`DROP VIEW ${qualified}`];
	}
	const definition = normalizedDefinition(input.definition ?? ''); const expectedName = exactNamePattern(input.schema, input.name);
	if (input.kind === 'view' || input.kind === 'materialized_view') {
		if (!/^(SELECT|WITH)\b/i.test(definition) || /;/.test(definition.replace(/'(?:''|[^'])*'/g, "''"))) throw new Error('View definitions must contain one read-only SELECT statement.');
		if (/\b(INSERT|UPDATE|DELETE|MERGE|CALL|COPY|LOAD\s+DATA|INTO\s+OUTFILE)\b/i.test(definition)) throw new Error('View definitions must be read-only.');
		if (input.kind === 'materialized_view') { if (engine !== 'postgresql') throw new Error('Materialized views are available only on PostgreSQL.'); return [`DROP MATERIALIZED VIEW IF EXISTS ${qualified}`, `CREATE MATERIALIZED VIEW ${qualified} AS ${definition}`]; }
		return [`CREATE OR REPLACE VIEW ${qualified} AS ${definition}`];
	}
	if (input.kind === 'sequence') {
		if (engine !== 'postgresql') throw new Error('Sequences are available only on PostgreSQL.');
		if (!/^(?:START\s+WITH\s+-?\d+\s*)?(?:INCREMENT\s+BY\s+-?\d+\s*)?(?:MINVALUE\s+-?\d+|NO\s+MINVALUE)?\s*(?:MAXVALUE\s+-?\d+|NO\s+MAXVALUE)?\s*(?:CACHE\s+\d+)?\s*(?:CYCLE|NO\s+CYCLE)?$/i.test(definition)) throw new Error('Sequence options are invalid.');
		return [`CREATE SEQUENCE IF NOT EXISTS ${qualified}`, `ALTER SEQUENCE ${qualified} ${definition}`];
	}
	const kind = input.kind.toUpperCase();
	if (!new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?${kind}\\s+${expectedName}\\b`, 'i').test(definition)) throw new Error(`Definition must create the selected ${input.kind} with the exact schema and name.`);
	if (input.kind === 'trigger') { const table = input.tableName ? exactNamePattern(input.schema, input.tableName) : ''; if (!new RegExp(`\\bON\\s+${table}\\b`, 'i').test(definition)) throw new Error('Trigger definition must target the selected table.'); }
	if (engine === 'mysql' && ['event', 'function', 'procedure', 'trigger'].includes(input.kind)) return [`DROP ${kind} IF EXISTS ${qualified}`, definition];
	if (engine === 'postgresql' && input.kind === 'event') throw new Error('Events are available only on MySQL.');
	return [definition];
}

/** Executes validated object DDL using only the logical database credential. */
export class DatabaseAdvancedObjectService {
	public constructor(private readonly connection: DatabaseExplorerConnection) {}
	public async mutate(input: DatabaseAdvancedObjectMutation): Promise<{ statements: number; target: string }> {
		const statements = advancedObjectStatements(this.connection.engine, input);
		if (this.connection.engine === 'postgresql') {
			const client = new pg.Client({ host: this.connection.host, port: this.connection.port, user: this.connection.username, password: this.connection.password, database: this.connection.databaseName, connectionTimeoutMillis: 8000, ssl: this.connection.tlsMode === 'disabled' ? undefined : { rejectUnauthorized: this.connection.tlsMode === 'verify-full' } });
			await client.connect(); try { await client.query('BEGIN'); await client.query('SET LOCAL statement_timeout = 15000'); for (const statement of statements) await client.query(statement); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { await client.end(); }
		} else {
			const client = await mysql.createConnection({ host: this.connection.host, port: this.connection.port, user: this.connection.username, password: this.connection.password, database: this.connection.databaseName, connectTimeout: 8000, multipleStatements: false, ssl: this.connection.tlsMode === 'disabled' ? undefined : {} });
			try { await client.query('SET SESSION MAX_EXECUTION_TIME = 15000'); for (const statement of statements) await client.query(statement); } finally { await client.end(); }
		}
		return { statements: statements.length, target: `${input.schema}.${input.name}` };
	}
}
