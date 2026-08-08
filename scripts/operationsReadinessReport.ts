import { getDatabasePool } from '@db/client';
import {
	generateOperationsReadinessReport,
	operationsReadinessRequiresAction,
} from '@services/operations/operationsReadinessService';

let exitCode = 1;
try {
	const report = await generateOperationsReadinessReport();
	console.log(JSON.stringify(report));
	exitCode = operationsReadinessRequiresAction(report) ? 2 : 0;
} catch {
	console.error(
		JSON.stringify({
			code: 'READINESS_DATABASE_UNAVAILABLE',
			message: 'The readiness report could not query the operational database.',
			status: 'failed',
		}),
	);
} finally {
	await getDatabasePool().end();
}
process.exitCode = exitCode;
