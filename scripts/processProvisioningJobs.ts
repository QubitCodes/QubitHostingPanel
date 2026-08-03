import { getDatabasePool } from '@db/client';
import { processProvisioningJobs } from '@services/provisioning/provisioningService';

try {
	const result = await processProvisioningJobs(10);
	console.info(`Processed ${result.processed} provisioning jobs: ${result.succeeded} succeeded, ${result.failed} failed.`);
} finally {
	await getDatabasePool().end();
}
