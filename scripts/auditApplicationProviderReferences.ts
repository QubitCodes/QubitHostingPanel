import { getDatabasePool } from '@db/client';
import { auditApplicationProviderReferences } from '@services/applications/applicationProviderReferenceAuditService';
import { hostingProvider } from '@services/hosting/hostingProviderFactory';

let exitCode = 1;
try {
	const report = await auditApplicationProviderReferences(await hostingProvider());
	console.log(JSON.stringify(report, null, 2));
	exitCode = report.providerAvailable ? 0 : 1;
} catch {
	console.error(
		JSON.stringify({
			code: 'PROVIDER_REFERENCE_AUDIT_FAILED',
			message: 'Application provider references could not be audited.',
			status: 'failed',
		}),
	);
} finally {
	await getDatabasePool().end();
}
process.exitCode = exitCode;
