import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import mysql from 'mysql2/promise';
import pg from 'pg';

import { getEnvironment } from '@config/env';
import type { DatabaseImportRequest } from '@schemas/databaseTransfer';
import { databaseDumpCommand, type DatabaseBackupConnection } from '@services/databases/databaseBackupService';

export interface UploadContext { actorUserId: string; databaseId: string; workspaceId: string }
export interface TransferExecutionHooks { onProgress?: (processedRows: number, totalRows: number) => Promise<void>; shouldCancel?: () => Promise<boolean> }
export interface UploadPayload extends UploadContext { checksum: string; expiresAt: number; format: 'csv' | 'json' | 'mysql-sql' | 'postgres-custom' | 'postgres-sql'; key: string; name: string; size: number }

function signingSecret(): string {
	const secret = getEnvironment().CREDENTIAL_ENCRYPTION_KEY;
	if (!secret) throw new Error('CREDENTIAL_ENCRYPTION_KEY is required.');
	return secret;
}

function encode(payload: UploadPayload): string {
	const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const signature = createHmac('sha256', signingSecret()).update(data).digest('base64url');
	return `${data}.${signature}`;
}

function decode(token: string, allowExpired = false): UploadPayload {
	const [data, provided] = token.split('.');
	if (!data || !provided) throw new Error('Import upload token is invalid.');
	const expected = createHmac('sha256', signingSecret()).update(data).digest();
	const actual = Buffer.from(provided, 'base64url');
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Import upload token is invalid.');
	const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as UploadPayload;
	if (!allowExpired && payload.expiresAt <= Date.now()) throw new Error('Import upload expired. Upload the file again.');
	return payload;
}

function importPath(key: string): string {
	if (!/^[a-f0-9-]{36}\.upload$/.test(key)) throw new Error('Import upload path is invalid.');
	return resolve(getEnvironment().DATABASE_IMPORT_STORAGE_PATH, key);
}

async function sha256(path: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
	return hash.digest('hex');
}

async function runImport(connection: DatabaseBackupConnection, path: string, payload: UploadPayload, mode: DatabaseImportRequest['mode'], hooks: TransferExecutionHooks): Promise<void> {
	const environment = { ...process.env };
	let command: string; let args: string[];
	if (connection.engine === 'postgresql') {
		environment.PGPASSWORD = connection.password; environment.PGSSLMODE = connection.tlsMode === 'disabled' ? 'disable' : connection.tlsMode;
		if (payload.format === 'postgres-custom') { command = getEnvironment().PG_RESTORE_PATH; args = ['--host', connection.host, '--port', String(connection.port), '--username', connection.username, '--dbname', connection.databaseName, '--no-owner', '--no-acl', '--exit-on-error', ...(mode === 'replace' ? ['--clean', '--if-exists'] : []), path]; }
		else { command = getEnvironment().PG_CLIENT_PATH; args = ['--host', connection.host, '--port', String(connection.port), '--username', connection.username, '--dbname', connection.databaseName, '--set', 'ON_ERROR_STOP=on', '--single-transaction', '--file', path]; }
	} else { environment.MYSQL_PWD = connection.password; command = getEnvironment().MYSQL_CLIENT_PATH; args = ['--host', connection.host, '--port', String(connection.port), '--user', connection.username, connection.databaseName]; }
	const child = spawn(command, args, { env: environment, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
	if (payload.format === 'mysql-sql') createReadStream(path).pipe(child.stdin); else child.stdin.end();
	const errors: Buffer[] = []; let cancellationRequested = false; child.stderr.on('data', (chunk: Buffer) => { if (Buffer.concat(errors).length < 65536) errors.push(chunk); });
	await new Promise<void>((resolveProcess, rejectProcess) => { const timeout = setTimeout(() => { child.kill(); rejectProcess(new Error('Database import timed out.')); }, getEnvironment().DATABASE_BACKUP_COMMAND_TIMEOUT_SECONDS * 1000); const cancellation = setInterval(() => { void hooks.shouldCancel?.().then((cancel) => { if (cancel) { cancellationRequested = true; child.kill(); } }); }, 750); child.once('error', (error) => { clearTimeout(timeout); clearInterval(cancellation); rejectProcess(error); }); child.once('close', (code) => { clearTimeout(timeout); clearInterval(cancellation); if (cancellationRequested) rejectProcess(new Error('Transfer cancelled.')); else if (code === 0) resolveProcess(); else rejectProcess(new Error(Buffer.concat(errors).toString('utf8').trim() || `Import exited with code ${code}.`)); }); });
}

function safeIdentifier(value: string): string {
	if (!/^[A-Za-z_][A-Za-z0-9_$]{0,127}$/.test(value)) throw new Error('Table and schema names must be valid database identifiers.');
	return value;
}

function quoted(engine: DatabaseBackupConnection['engine'], value: string): string {
	const identifier = safeIdentifier(value);
	return engine === 'postgresql' ? `"${identifier}"` : `\`${identifier}\``;
}

export function parseTransferCsv(source: string): Array<Record<string, unknown>> {
	const rows: string[][] = []; let row: string[] = []; let value = ''; let quotedValue = false;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		if (quotedValue) {
			if (character === '"' && source[index + 1] === '"') { value += '"'; index += 1; }
			else if (character === '"') quotedValue = false;
			else value += character;
		} else if (character === '"') quotedValue = true;
		else if (character === ',') { row.push(value); value = ''; }
		else if (character === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
		else value += character;
	}
	if (quotedValue) throw new Error('CSV contains an unterminated quoted value.');
	if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
	const headers = rows.shift()?.map((header) => safeIdentifier(header.trim()));
	if (!headers?.length || new Set(headers).size !== headers.length) throw new Error('CSV requires a unique identifier header row.');
	return rows.filter((item) => item.some((cell) => cell.length > 0)).map((item) => Object.fromEntries(headers.map((header, index) => [header, item[index] ?? null])));
}

function parseTabular(format: UploadPayload['format'], bytes: Buffer): Array<Record<string, unknown>> {
	if (format === 'csv') return parseTransferCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''));
	if (format !== 'json') throw new Error('The staged file is not a tabular import.');
	const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
	if (!Array.isArray(parsed) || !parsed.every((row) => row && typeof row === 'object' && !Array.isArray(row))) throw new Error('JSON imports require an array of objects.');
	return parsed as Array<Record<string, unknown>>;
}

function normalizedRows(rows: Array<Record<string, unknown>>): { columns: string[]; rows: Array<Record<string, unknown>> } {
	if (!rows.length) throw new Error('The import file contains no rows.');
	if (rows.length > 100_000) throw new Error('Table imports are limited to 100,000 rows per job.');
	const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].map(safeIdentifier);
	if (!columns.length || columns.length > 250) throw new Error('Table imports require between 1 and 250 columns.');
	return { columns, rows };
}

function csvValue(value: unknown): string {
	const normalized = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
	return `"${normalized.replace(/"/g, '""')}"`;
}

async function importTable(connection: DatabaseBackupConnection, schema: string, table: string, mode: DatabaseImportRequest['mode'], sourceRows: Array<Record<string, unknown>>, hooks: TransferExecutionHooks): Promise<number> {
	const { columns, rows } = normalizedRows(sourceRows);
	const target = `${quoted(connection.engine, schema)}.${quoted(connection.engine, table)}`;
	if (connection.engine === 'postgresql') {
		const client = new pg.Client({ host: connection.host, port: connection.port, user: connection.username, password: connection.password, database: connection.databaseName, connectionTimeoutMillis: 8000, ssl: connection.tlsMode === 'disabled' ? undefined : { rejectUnauthorized: connection.tlsMode === 'verify-full' } });
		await client.connect();
		try {
			await client.query('BEGIN'); await client.query('SET LOCAL statement_timeout = 60000');
			if (mode === 'replace') await client.query(`TRUNCATE TABLE ${target}`);
			for (let offset = 0; offset < rows.length; offset += 100) {
				if (await hooks.shouldCancel?.()) throw new Error('Transfer cancelled.');
				const batch = rows.slice(offset, offset + 100); const values = batch.flatMap((row) => columns.map((column) => row[column] ?? null));
				const placeholders = batch.map((_, rowIndex) => `(${columns.map((__, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(',')})`).join(',');
				await client.query(`INSERT INTO ${target} (${columns.map((column) => quoted(connection.engine, column)).join(',')}) VALUES ${placeholders}`, values);
				await hooks.onProgress?.(Math.min(offset + batch.length, rows.length), rows.length);
			}
			await client.query('COMMIT');
		} catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { await client.end(); }
	} else {
		const client = await mysql.createConnection({ host: connection.host, port: connection.port, user: connection.username, password: connection.password, database: connection.databaseName, connectTimeout: 8000, ssl: connection.tlsMode === 'disabled' ? undefined : {} });
		try {
			if (mode === 'replace') await client.query(`TRUNCATE TABLE ${target}`);
			for (let offset = 0; offset < rows.length; offset += 100) {
				if (await hooks.shouldCancel?.()) throw new Error('Transfer cancelled.');
				const batch = rows.slice(offset, offset + 100); const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
				await client.query(`INSERT INTO ${target} (${columns.map((column) => quoted(connection.engine, column)).join(',')}) VALUES ${placeholders}`, batch.flatMap((row) => columns.map((column) => row[column] ?? null)));
				await hooks.onProgress?.(Math.min(offset + batch.length, rows.length), rows.length);
			}
		} finally { await client.end(); }
	}
	return rows.length;
}

/** Stages signed uploads and runs native imports without returning database credentials. */
export class DatabaseTransferService {
	public async stage(file: File, engine: DatabaseBackupConnection['engine'], context: UploadContext): Promise<{ expiresAt: string; format: UploadPayload['format']; name: string; size: number; uploadToken: string }> {
		const maximum = getEnvironment().DATABASE_IMPORT_MAX_MB * 1048576;
		if (!file.size || file.size > maximum) throw new Error(`Import files must be between 1 byte and ${getEnvironment().DATABASE_IMPORT_MAX_MB} MB.`);
		const bytes = Buffer.from(await file.arrayBuffer());
		const normalizedName = file.name.toLowerCase();
		const customPostgres = bytes.subarray(0, 5).toString('ascii') === 'PGDMP';
		const hasNull = bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0);
		const format: UploadPayload['format'] = normalizedName.endsWith('.csv') ? 'csv' : normalizedName.endsWith('.json') ? 'json' : engine === 'postgresql' ? customPostgres ? 'postgres-custom' : 'postgres-sql' : 'mysql-sql';
		if (!customPostgres && hasNull) throw new Error('Plain SQL imports must be valid text files.');
		const key = `${randomUUID()}.upload`; const path = importPath(key); const directory = resolve(path, '..'); await mkdir(directory, { recursive: true });
		for (const entry of await readdir(directory)) if (/^[a-f0-9-]{36}\.upload(?:\.running)?$/.test(entry)) { const candidate = resolve(directory, entry); const details = await stat(candidate).catch(() => undefined); if (details && details.mtimeMs < Date.now() - getEnvironment().DATABASE_IMPORT_TOKEN_TTL_MINUTES * 60000) await rm(candidate, { force: true }); }
		await writeFile(path, bytes, { flag: 'wx' });
		const expiresAt = Date.now() + getEnvironment().DATABASE_IMPORT_TOKEN_TTL_MINUTES * 60000;
		const payload: UploadPayload = { ...context, checksum: createHash('sha256').update(bytes).digest('hex'), expiresAt, format, key, name: file.name.slice(0, 255), size: file.size };
		return { expiresAt: new Date(expiresAt).toISOString(), format, name: payload.name, size: payload.size, uploadToken: encode(payload) };
	}

	/** Validates a staged upload without exposing its server path. */
	public inspect(uploadToken: string, context: UploadContext): Pick<UploadPayload, 'expiresAt' | 'format' | 'name' | 'size'> {
		const payload = decode(uploadToken);
		if (payload.actorUserId !== context.actorUserId || payload.databaseId !== context.databaseId || payload.workspaceId !== context.workspaceId) throw new Error('Import upload does not belong to this database session.');
		return { expiresAt: payload.expiresAt, format: payload.format, name: payload.name, size: payload.size };
	}

	public async import(connection: DatabaseBackupConnection, request: DatabaseImportRequest, context: UploadContext, hooks: TransferExecutionHooks = {}): Promise<{ format: UploadPayload['format']; name: string; rows?: number; size: number }> {
		const payload = decode(request.uploadToken, true);
		if (payload.actorUserId !== context.actorUserId || payload.databaseId !== context.databaseId || payload.workspaceId !== context.workspaceId) throw new Error('Import upload does not belong to this database session.');
		const path = importPath(payload.key); const runningPath = `${path}.running`;
		let completed = false;
		try {
			await rename(path, runningPath);
			const details = await stat(runningPath);
			if (details.size !== payload.size || await sha256(runningPath) !== payload.checksum) throw new Error('Import upload integrity verification failed.');
			if (await hooks.shouldCancel?.()) throw new Error('Transfer cancelled.');
			if (payload.format === 'csv' || payload.format === 'json') {
				if (!request.schema || !request.table) throw new Error('Schema and table are required for CSV and JSON imports.');
				const rows = await importTable(connection, request.schema, request.table, request.mode, parseTabular(payload.format, await readFile(runningPath)), hooks);
				completed = true; return { format: payload.format, name: payload.name, rows, size: payload.size };
			}
			await runImport(connection, runningPath, payload, request.mode, hooks);
			await hooks.onProgress?.(1, 1);
			completed = true; return { format: payload.format, name: payload.name, size: payload.size };
		} finally { if (completed) await rm(runningPath, { force: true }); else await rename(runningPath, path).catch(() => undefined); }
	}

	public export(connection: DatabaseBackupConnection): { filename: string; stream: Readable } {
		const native = databaseDumpCommand(connection); const child = spawn(native.command, native.args, { env: native.environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); const errors: Buffer[] = [];
		child.stderr.on('data', (chunk: Buffer) => errors.push(chunk)); child.once('close', (code) => { if (code !== 0) child.stdout.destroy(new Error(Buffer.concat(errors).toString('utf8').trim() || 'Database export failed.')); });
		return { filename: `${connection.databaseName}-${new Date().toISOString().slice(0, 10)}.${connection.engine === 'postgresql' ? 'dump' : 'sql'}`, stream: child.stdout };
	}

	/** Produces one bounded table export without granting filesystem or arbitrary SQL access. */
	public async exportTable(connection: DatabaseBackupConnection, schema: string, table: string, format: 'csv' | 'json', hooks: TransferExecutionHooks = {}): Promise<{ bytes: Buffer; filename: string; rows: number }> {
		const target = `${quoted(connection.engine, schema)}.${quoted(connection.engine, table)}`;
		const rows: Array<Record<string, unknown>> = [];
		const pageSize = 1_000;
		if (connection.engine === 'postgresql') {
			const client = new pg.Client({ host: connection.host, port: connection.port, user: connection.username, password: connection.password, database: connection.databaseName, connectionTimeoutMillis: 8000, ssl: connection.tlsMode === 'disabled' ? undefined : { rejectUnauthorized: connection.tlsMode === 'verify-full' } });
			await client.connect();
			try { await client.query('BEGIN READ ONLY'); await client.query('SET LOCAL statement_timeout = 60000'); for (let offset = 0; offset < 100_000; offset += pageSize) { if (await hooks.shouldCancel?.()) throw new Error('Transfer cancelled.'); const result = await client.query(`SELECT * FROM ${target} LIMIT $1 OFFSET $2`, [pageSize, offset]); rows.push(...result.rows as Array<Record<string, unknown>>); await hooks.onProgress?.(rows.length, result.rows.length < pageSize ? rows.length : 100_000); if (result.rows.length < pageSize) break; } await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { await client.end(); }
		} else {
			const client = await mysql.createConnection({ host: connection.host, port: connection.port, user: connection.username, password: connection.password, database: connection.databaseName, connectTimeout: 8000, ssl: connection.tlsMode === 'disabled' ? undefined : {} });
			try { for (let offset = 0; offset < 100_000; offset += pageSize) { if (await hooks.shouldCancel?.()) throw new Error('Transfer cancelled.'); const [batch] = await client.query<mysql.RowDataPacket[]>(`SELECT * FROM ${target} LIMIT ? OFFSET ?`, [pageSize, offset]); rows.push(...batch as Array<Record<string, unknown>>); await hooks.onProgress?.(rows.length, batch.length < pageSize ? rows.length : 100_000); if (batch.length < pageSize) break; } } finally { await client.end(); }
		}
		if (rows.length >= 100_000) throw new Error('Table export exceeded the 100,000-row safety limit. Narrow the table before exporting.');
		const columns = rows.length ? Object.keys(rows[0]) : [];
		const content = format === 'json' ? JSON.stringify(rows, (_, value: unknown) => typeof value === 'bigint' ? value.toString() : value, 2) : `\uFEFF${[columns.map(csvValue).join(','), ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(','))].join('\r\n')}\r\n`;
		return { bytes: Buffer.from(content, 'utf8'), filename: `${table}-${new Date().toISOString().slice(0, 10)}.${format}`, rows: rows.length };
	}
}
