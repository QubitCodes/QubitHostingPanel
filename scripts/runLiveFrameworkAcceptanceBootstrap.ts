import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * qcresp 1.0.1 publishes ESM syntax without a nested package type marker.
 * Add the missing metadata before Node resolves controller imports. Remove this
 * compatibility bootstrap once qcresp publishes an explicitly typed ESM build.
 */
async function ensureQcrespEsmMetadata(): Promise<void> {
	const directory = resolve('node_modules/@qubitcodes/qcresp/dist/esm');
	await access(directory);
	await writeFile(
		resolve(directory, 'package.json'),
		`${JSON.stringify({ type: 'module' })}\n`,
		'utf8',
	);
}

await ensureQcrespEsmMetadata();
await import('./runLiveFrameworkAcceptance');
