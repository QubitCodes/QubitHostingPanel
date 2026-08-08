import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

import { getEnvironment } from '@config/env';
import type { DatabaseImportRequest } from '@schemas/databaseTransfer';
import { databaseDumpCommand, type DatabaseBackupConnection } from '@services/databases/databaseBackupService';

interface UploadContext { actorUserId: string; databaseId: string; workspaceId: string }
interface UploadPayload extends UploadContext { checksum: string; expiresAt: number; format: 'mysql-sql' | 'postgres-custom' | 'postgres-sql'; key: string; name: string; size: number }

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

function decode(token: string): UploadPayload {
	const [data, provided] = token.split('.');
	if (!data || !provided) throw new Error('Import upload token is invalid.');
	const expected = createHmac('sha256', signingSecret()).update(data).digest();
	const actual = Buffer.from(provided, 'base64url');
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Import upload token is invalid.');
	const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as UploadPayload;
	if (payload.expiresAt <= Date.now()) throw new Error('Import upload expired. Upload the file again.');
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

async function runImport(connection: DatabaseBackupConnection, path: string, payload: UploadPayload, mode: DatabaseImportRequest['mode']): Promise<void> {
	const environment = { ...process.env };
	let command: string; let args: string[];
	if (connection.engine === 'postgresql') {
		environment.PGPASSWORD = connection.password; environment.PGSSLMODE = connection.tlsMode === 'disabled' ? 'disable' : connection.tlsMode;
		if (payload.format === 'postgres-custom') { command = getEnvironment().PG_RESTORE_PATH; args = ['--host', connection.host, '--port', String(connection.port), '--username', connection.username, '--dbname', connection.databaseName, '--no-owner', '--no-acl', '--exit-on-error', ...(mode === 'replace' ? ['--clean', '--if-exists'] : []), path]; }
		else { command = getEnvironment().PG_CLIENT_PATH; args = ['--host', connection.host, '--port', String(connection.port), '--username', connection.username, '--dbname', connection.databaseName, '--set', 'ON_ERROR_STOP=on', '--single-transaction', '--file', path]; }
	} else { environment.MYSQL_PWD = connection.password; command = getEnvironment().MYSQL_CLIENT_PATH; args = ['--host', connection.host, '--port', String(connection.port), '--user', connection.username, connection.databaseName]; }
	const child = spawn(command, args, { env: environment, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
	if (payload.format === 'mysql-sql') createReadStream(path).pipe(child.stdin); else child.stdin.end();
	const errors: Buffer[] = []; child.stderr.on('data', (chunk: Buffer) => { if (Buffer.concat(errors).length < 65536) errors.push(chunk); });
	await new Promise<void>((resolveProcess, rejectProcess) => { const timeout = setTimeout(() => { child.kill(); rejectProcess(new Error('Database import timed out.')); }, getEnvironment().DATABASE_BACKUP_COMMAND_TIMEOUT_SECONDS * 1000); child.once('error', rejectProcess); child.once('close', (code) => { clearTimeout(timeout); if (code === 0) resolveProcess(); else rejectProcess(new Error(Buffer.concat(errors).toString('utf8').trim() || `Import exited with code ${code}.`)); }); });
}

/** Stages signed uploads and runs native imports without returning database credentials. */
export class DatabaseTransferService {
	public async stage(file: File, engine: DatabaseBackupConnection['engine'], context: UploadContext): Promise<{ expiresAt: string; format: UploadPayload['format']; name: string; size: number; uploadToken: string }> {
		const maximum = getEnvironment().DATABASE_IMPORT_MAX_MB * 1048576;
		if (!file.size || file.size > maximum) throw new Error(`Import files must be between 1 byte and ${getEnvironment().DATABASE_IMPORT_MAX_MB} MB.`);
		const bytes = Buffer.from(await file.arrayBuffer());
		const customPostgres = bytes.subarray(0, 5).toString('ascii') === 'PGDMP';
		const hasNull = bytes.subarray(0, Math.min(bytes.length, 8192)).includes(0);
		const format: UploadPayload['format'] = engine === 'postgresql' ? customPostgres ? 'postgres-custom' : 'postgres-sql' : 'mysql-sql';
		if (!customPostgres && hasNull) throw new Error('Plain SQL imports must be valid text files.');
		const key = `${randomUUID()}.upload`; const path = importPath(key); const directory = resolve(path, '..'); await mkdir(directory, { recursive: true });
		for (const entry of await readdir(directory)) if (/^[a-f0-9-]{36}\.upload(?:\.running)?$/.test(entry)) { const candidate = resolve(directory, entry); const details = await stat(candidate).catch(() => undefined); if (details && details.mtimeMs < Date.now() - getEnvironment().DATABASE_IMPORT_TOKEN_TTL_MINUTES * 60000) await rm(candidate, { force: true }); }
		await writeFile(path, bytes, { flag: 'wx' });
		const expiresAt = Date.now() + getEnvironment().DATABASE_IMPORT_TOKEN_TTL_MINUTES * 60000;
		const payload: UploadPayload = { ...context, checksum: createHash('sha256').update(bytes).digest('hex'), expiresAt, format, key, name: file.name.slice(0, 255), size: file.size };
		return { expiresAt: new Date(expiresAt).toISOString(), format, name: payload.name, size: payload.size, uploadToken: encode(payload) };
	}

	public async import(connection: DatabaseBackupConnection, request: DatabaseImportRequest, context: UploadContext): Promise<{ format: UploadPayload['format']; name: string; size: number }> {
		const payload = decode(request.uploadToken);
		if (payload.actorUserId !== context.actorUserId || payload.databaseId !== context.databaseId || payload.workspaceId !== context.workspaceId) throw new Error('Import upload does not belong to this database session.');
		const path = importPath(payload.key); const runningPath = `${path}.running`;
		try { await rename(path, runningPath); const details = await stat(runningPath); if (details.size !== payload.size || await sha256(runningPath) !== payload.checksum) throw new Error('Import upload integrity verification failed.'); await runImport(connection, runningPath, payload, request.mode); return { format: payload.format, name: payload.name, size: payload.size }; } finally { await rm(runningPath, { force: true }); }
	}

	public export(connection: DatabaseBackupConnection): { filename: string; stream: Readable } {
		const native = databaseDumpCommand(connection); const child = spawn(native.command, native.args, { env: native.environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); const errors: Buffer[] = [];
		child.stderr.on('data', (chunk: Buffer) => errors.push(chunk)); child.once('close', (code) => { if (code !== 0) child.stdout.destroy(new Error(Buffer.concat(errors).toString('utf8').trim() || 'Database export failed.')); });
		return { filename: `${connection.databaseName}-${new Date().toISOString().slice(0, 10)}.${connection.engine === 'postgresql' ? 'dump' : 'sql'}`, stream: child.stdout };
	}
}
