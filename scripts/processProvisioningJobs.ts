import { getDatabasePool } from '@db/client';
import { processProvisioningJobs } from '@services/provisioning/provisioningService';
import { processDatabaseTransferJobs } from '@services/databases/databaseTransferJobService';

try {
	const result = await processProvisioningJobs(10);
	console.info(`Processed ${result.processed} provisioning jobs: ${result.succeeded} succeeded, ${result.failed} failed.`);
	const transfers = await processDatabaseTransferJobs(3);
	console.info(`Processed ${transfers.processed} database transfer jobs: ${transfers.succeeded} succeeded, ${transfers.failed} failed, ${transfers.cancelled} cancelled, ${transfers.cleaned} artifacts cleaned.`);
} finally {
	await getDatabasePool().end();
}
