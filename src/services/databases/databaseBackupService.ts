import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, mkdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

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

export interface StoredDatabaseBackup { checksumSha256: string; sizeBytes: number; storageKey: string; storageProvider: 'local' | 's3' }

function s3Configuration() {
	const environment = getEnvironment();
	if (!environment.DATABASE_BACKUP_S3_BUCKET || !environment.DATABASE_BACKUP_S3_ACCESS_KEY_ID || !environment.DATABASE_BACKUP_S3_SECRET_ACCESS_KEY) return undefined;
	return {
		bucket: environment.DATABASE_BACKUP_S3_BUCKET,
		client: new S3Client({
			credentials: { accessKeyId: environment.DATABASE_BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: environment.DATABASE_BACKUP_S3_SECRET_ACCESS_KEY },
			endpoint: environment.DATABASE_BACKUP_S3_ENDPOINT,
			forcePathStyle: environment.DATABASE_BACKUP_S3_FORCE_PATH_STYLE === 'true',
			region: environment.DATABASE_BACKUP_S3_REGION,
		}),
	};
}

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
	private async materialize(storageKey: string, storageProvider: 'local' | 's3'): Promise<{ cleanup: () => Promise<void>; path: string }> {
		const environment = getEnvironment();
		const target = resolveDatabaseBackupPath(environment.DATABASE_BACKUP_STORAGE_PATH, storageKey);
		if (storageProvider === 'local') return { cleanup: async () => undefined, path: target };
		const s3 = s3Configuration();
		if (!s3) throw new Error('Off-site backup storage is not configured.');
		const temporary = `${target}.download`;
		await mkdir(resolve(temporary, '..'), { recursive: true });
		const response = await s3.client.send(new GetObjectCommand({ Bucket: s3.bucket, Key: storageKey }));
		if (!response.Body) throw new Error('Off-site backup artifact is empty.');
		await pipeline(response.Body as Readable, createWriteStream(temporary, { flags: 'wx' }));
		return { cleanup: async () => rm(temporary, { force: true }), path: temporary };
	}

	private async verifiedDecryptStream(storageKey: string, expectedChecksum: string, storageProvider: 'local' | 's3'): Promise<Readable> {
		const materialized = await this.materialize(storageKey, storageProvider); const target = materialized.path;
		try { const details = await stat(target); if (details.size <= BACKUP_VERSION.length + IV_LENGTH + AUTH_TAG_LENGTH) throw new Error('Backup artifact is incomplete.'); const checksum = await sha256File(target); if (checksum !== expectedChecksum) throw new Error('Backup checksum verification failed.'); const header = Buffer.alloc(BACKUP_VERSION.length + IV_LENGTH); const handle = await import('node:fs/promises').then(({ open }) => open(target, 'r')); await handle.read(header, 0, header.length, 0); const tag = Buffer.alloc(AUTH_TAG_LENGTH); await handle.read(tag, 0, tag.length, details.size - AUTH_TAG_LENGTH); await handle.close(); if (!header.subarray(0, BACKUP_VERSION.length).equals(BACKUP_VERSION)) throw new Error('Backup artifact version is unsupported.'); const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), header.subarray(BACKUP_VERSION.length)); decipher.setAuthTag(tag); const stream = createReadStream(target, { start: header.length, end: details.size - AUTH_TAG_LENGTH - 1 }).pipe(decipher); stream.once('close', () => { void materialized.cleanup(); }); stream.once('error', () => { void materialized.cleanup(); }); return stream; }
		catch (error) { await materialized.cleanup(); throw error; }
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
			const checksumSha256 = await sha256File(target); const details = await stat(target); const s3 = s3Configuration();
			if (s3) { await s3.client.send(new PutObjectCommand({ Body: createReadStream(target), Bucket: s3.bucket, ContentLength: details.size, ContentType: 'application/octet-stream', Key: storageKey, Metadata: { checksum: checksumSha256 } })); await rm(target, { force: true }); }
			return { checksumSha256, sizeBytes: details.size, storageKey, storageProvider: s3 ? 's3' : 'local' };
		} catch (error) { child.kill(); await rm(target, { force: true }); throw error; }
	}

	public async restore(connection: DatabaseBackupConnection, storageKey: string, expectedChecksum: string, storageProvider: 'local' | 's3' = 'local'): Promise<void> {
		const environment = getEnvironment(); const source = await this.verifiedDecryptStream(storageKey, expectedChecksum, storageProvider); const command = databaseRestoreCommand(connection); const child = spawn(command.command, command.args, { env: command.environment, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true }); const errors: Buffer[] = []; child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
		await Promise.all([pipeline(source, child.stdin), waitForProcess(child, errors, environment.DATABASE_BACKUP_COMMAND_TIMEOUT_SECONDS * 1000)]);
	}

	public async download(storageKey: string, expectedChecksum: string, storageProvider: 'local' | 's3' = 'local'): Promise<Readable> { return this.verifiedDecryptStream(storageKey, expectedChecksum, storageProvider); }

	public async delete(storageKey: string, storageProvider: 'local' | 's3' = 'local'): Promise<void> { const s3 = storageProvider === 's3' ? s3Configuration() : undefined; if (storageProvider === 's3') { if (!s3) throw new Error('Off-site backup storage is not configured.'); await s3.client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: storageKey })); return; } await rm(resolveDatabaseBackupPath(getEnvironment().DATABASE_BACKUP_STORAGE_PATH, storageKey), { force: true }); }

	/** Confirms that an artifact can be fetched, checksummed, authenticated, and decrypted without mutating a database. */
	public async verify(storageKey: string, expectedChecksum: string, storageProvider: 'local' | 's3' = 'local'): Promise<void> { const stream = await this.verifiedDecryptStream(storageKey, expectedChecksum, storageProvider); for await (const chunk of stream) void chunk; }
}

export const databaseBackupService = new DatabaseBackupService();
