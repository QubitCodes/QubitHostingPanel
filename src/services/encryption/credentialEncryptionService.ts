import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { getEnvironment } from '@config/env';

function encryptionKey(): Buffer {
	const secret = getEnvironment().CREDENTIAL_ENCRYPTION_KEY;
	if (!secret) throw new Error('CREDENTIAL_ENCRYPTION_KEY is required.');
	return createHash('sha256').update(secret).digest();
}

/** Encrypts infrastructure credentials using authenticated AES-256-GCM. */
export function encryptCredential(value: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

/** Decrypts a versioned infrastructure credential envelope. */
export function decryptCredential(envelope: string): string {
	const [version, iv, tag, ciphertext] = envelope.split(':');
	if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Credential envelope is invalid.');
	const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
