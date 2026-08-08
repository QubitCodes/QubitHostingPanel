import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

import { getEnvironment } from '@config/env';

const VERSION = Buffer.from('QDT1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function key(): Buffer {
	const secret = getEnvironment().CREDENTIAL_ENCRYPTION_KEY;
	if (!secret) throw new Error('CREDENTIAL_ENCRYPTION_KEY is required.');
	return createHash('sha256').update(`database-transfer:${secret}`).digest();
}

function artifactPath(storageKey: string): string {
	if (isAbsolute(storageKey) || !/^[a-f0-9-]{36}\.qdt$/.test(storageKey)) throw new Error('Transfer artifact key is invalid.');
	const root = resolve(getEnvironment().DATABASE_TRANSFER_STORAGE_PATH);
	const target = resolve(root, storageKey);
	if (!target.startsWith(`${root}${sep}`)) throw new Error('Transfer artifact escapes its storage root.');
	return target;
}

/** Authenticated encryption for short-lived import/export artifacts. */
export class DatabaseTransferArtifactService {
	public async create(storageKey: string, bytes: Buffer): Promise<{ checksumSha256: string; sizeBytes: number }> {
		const iv = randomBytes(IV_LENGTH); const cipher = createCipheriv('aes-256-gcm', key(), iv);
		const encrypted = Buffer.concat([VERSION, iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
		const target = artifactPath(storageKey); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, encrypted, { flag: 'wx' });
		return { checksumSha256: createHash('sha256').update(encrypted).digest('hex'), sizeBytes: encrypted.length };
	}

	public async read(storageKey: string, expectedChecksum: string): Promise<Buffer> {
		const encrypted = await readFile(artifactPath(storageKey));
		if (createHash('sha256').update(encrypted).digest('hex') !== expectedChecksum) throw new Error('Transfer artifact checksum verification failed.');
		if (encrypted.length <= VERSION.length + IV_LENGTH + TAG_LENGTH || !encrypted.subarray(0, VERSION.length).equals(VERSION)) throw new Error('Transfer artifact is invalid.');
		const iv = encrypted.subarray(VERSION.length, VERSION.length + IV_LENGTH); const tag = encrypted.subarray(encrypted.length - TAG_LENGTH); const ciphertext = encrypted.subarray(VERSION.length + IV_LENGTH, encrypted.length - TAG_LENGTH);
		const decipher = createDecipheriv('aes-256-gcm', key(), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
	}

	public async delete(storageKey: string): Promise<void> { await rm(artifactPath(storageKey), { force: true }); }
}

export const databaseTransferArtifactService = new DatabaseTransferArtifactService();
