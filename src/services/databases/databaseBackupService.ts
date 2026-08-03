import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, mkdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

import { getEnvironment } from '@config/env';
import type { SharedDatabaseEngine } from '@services/databases/SharedDatabaseProvisioner';

const BACKUP_VERSION = Buffer.from('QDB1');
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface DatabaseBackupConnection {
	databaseName: string;
	engine: SharedDatabaseEngine;
	host: string;
	password: string;
	port: number;
	tlsMode: 'disabled' | 'require' | 'verify-full';
	username: string;
}

export interface StoredDatabaseBackup { checksumSha256: string; sizeBytes: number; storageKey: string }

function encryptionKey(): Buffer {
	const secret = getEnvironment().CREDENTIAL_ENCRYPTION_KEY;
	if (!secret) throw new Error('CREDENTIAL_ENCRYPTION_KEY is required.');
	return createHash('sha256').update(`database-backup:${secret}`).digest();
}

/** Resolves a generated backup key and prevents traversal outside the configured storage root. */
export function resolveDatabaseBackupPath(storageRoot: string, storageKey: string): string {
	if (isAbsolute(storageKey) || !/^[a-zA-Z0-9/_-]+\.qdb$/.test(storageKey)) throw new Error('Backup storage key is invalid.');
	const root = resolve(storageRoot);
	const target = resolve(root, storageKey);
	if (!target.startsWith(`${root}${sep}`)) throw new Error('Backup storage key escapes its root.');
	return target;
}

/** Returns a native dump command without placing a password on the command line. */
export function databaseDumpCommand(connection: DatabaseBackupConnection): { command: string; args: string[]; environment: NodeJS.ProcessEnv } {
	const environment = { ...process.env };
	if (connection.engine === 'postgresql') {
		environment.PGPASSWORD = connection.password;
		environment.PGSSLMODE = connection.tlsMode === 'disabled' ? 'disable' : connection.tlsMode;
		return { command: getEnvironment().PG_DUMP_PATH, args: ['--host', connection.host, '--port', String(connection.port), '--username', connection.username, '--dbname', connection.databaseName, '--format=custom', '--no-owner', '--no-acl'], environment };
	}
	environment.MYSQL_PWD = connection.password;
	return { command: getEnvironment().MYSQL_DUMP_PATH, args: ['--host', connection.host, '--port', String(connection.port), '--user', connection.username, '--single-transaction', '--routines', '--triggers', '--hex-blob', connection.databaseName], environment };
}

function databaseRestoreCommand(connection: DatabaseBackupConnection): { command: string; args: string[]; environment: NodeJS.ProcessEnv } {
	const environment = { ...process.env };
	if (connection.engine === 'postgresql') {
		environment.PGPASSWORD = connection.password;
		environment.PGSSLMODE = connection.tlsMode === 'disabled' ? 'disable' : connection.tlsMode;
		return { command: getEnvironment().PG_RESTORE_PATH, args: ['--host', connection.host, '--port', String(connection.port), '--username', connection.username, '--dbname', connection.databaseName, '--clean', '--if-exists', '--no-owner', '--no-acl'], environment };
	}
	environment.MYSQL_PWD = connection.password;
	return { command: getEnvironment().MYSQL_CLIENT_PATH, args: ['--host', connection.host, '--port', String(connection.port), '--user', connection.username, connection.databaseName], environment };
}

async function waitForProcess(process: ReturnType<typeof spawn>, errorChunks: Buffer[], timeoutMs: number): Promise<void> {
	await new Promise<void>((resolveProcess, rejectProcess) => {
		const timeout = setTimeout(() => { process.kill(); rejectProcess(new Error('Database backup command timed out.')); }, timeoutMs);
		process.once('error', (error) => { clearTimeout(timeout); rejectProcess(error); });
		process.once('close', (code) => { clearTimeout(timeout); if (code === 0) resolveProcess(); else rejectProcess(new Error(Buffer.concat(errorChunks).toString('utf8').trim() || `Database command exited with code ${code}.`)); });
	});
}

/** Hashes large encrypted artifacts without retaining their contents in application memory. */
async function sha256File(path: string): Promise<string> {
	const hash = createHash('sha256');
	await pipeline(createReadStream(path), hash);
	return hash.digest('hex');
}

/** Creates and restores authenticated-encrypted native database dumps. */
export class DatabaseBackupService {
	private async verifiedDecryptStream(storageKey: string, expectedChecksum: string): Promise<Readable> {
		const target = resolveDatabaseBackupPath(getEnvironment().DATABASE_BACKUP_STORAGE_PATH, storageKey); const details = await stat(target);
		if (details.size <= BACKUP_VERSION.length + IV_LENGTH + AUTH_TAG_LENGTH) throw new Error('Backup artifact is incomplete.');
		const checksum = await sha256File(target);
		if (checksum !== expectedChecksum) throw new Error('Backup checksum verification failed.');
		const header = Buffer.alloc(BACKUP_VERSION.length + IV_LENGTH); const handle = await import('node:fs/promises').then(({ open }) => open(target, 'r')); await handle.read(header, 0, header.length, 0); const tag = Buffer.alloc(AUTH_TAG_LENGTH); await handle.read(tag, 0, tag.length, details.size - AUTH_TAG_LENGTH); await handle.close();
		if (!header.subarray(0, BACKUP_VERSION.length).equals(BACKUP_VERSION)) throw new Error('Backup artifact version is unsupported.');
		const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), header.subarray(BACKUP_VERSION.length)); decipher.setAuthTag(tag);
		return createReadStream(target, { start: header.length, end: details.size - AUTH_TAG_LENGTH - 1 }).pipe(decipher);
	}

	public async create(connection: DatabaseBackupConnection, storageKey: string): Promise<StoredDatabaseBackup> {
		const environment = getEnvironment();
		const target = resolveDatabaseBackupPath(environment.DATABASE_BACKUP_STORAGE_PATH, storageKey);
		await mkdir(resolve(target, '..'), { recursive: true });
		const iv = randomBytes(IV_LENGTH); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv); const command = databaseDumpCommand(connection); const child = spawn(command.command, command.args, { env: command.environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); const errors: Buffer[] = [];
		child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
		try {
			const output = createWriteStream(target, { flags: 'wx' }); output.write(BACKUP_VERSION); output.write(iv);
			await Promise.all([pipeline(child.stdout, cipher, output), waitForProcess(child, errors, environment.DATABASE_BACKUP_COMMAND_TIMEOUT_SECONDS * 1000)]);
			await appendFile(target, cipher.getAuthTag());
			const checksumSha256 = await sha256File(target); const details = await stat(target);
			return { checksumSha256, sizeBytes: details.size, storageKey };
		} catch (error) { child.kill(); await rm(target, { force: true }); throw error; }
	}

	public async restore(connection: DatabaseBackupConnection, storageKey: string, expectedChecksum: string): Promise<void> {
		const environment = getEnvironment(); const source = await this.verifiedDecryptStream(storageKey, expectedChecksum); const command = databaseRestoreCommand(connection); const child = spawn(command.command, command.args, { env: command.environment, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true }); const errors: Buffer[] = []; child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
		await Promise.all([pipeline(source, child.stdin), waitForProcess(child, errors, environment.DATABASE_BACKUP_COMMAND_TIMEOUT_SECONDS * 1000)]);
	}

	public async download(storageKey: string, expectedChecksum: string): Promise<Readable> { return this.verifiedDecryptStream(storageKey, expectedChecksum); }

	public async delete(storageKey: string): Promise<void> { await rm(resolveDatabaseBackupPath(getEnvironment().DATABASE_BACKUP_STORAGE_PATH, storageKey), { force: true }); }
}

export const databaseBackupService = new DatabaseBackupService();
