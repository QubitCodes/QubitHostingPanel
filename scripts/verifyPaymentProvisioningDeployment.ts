import { Client } from 'pg';

import { getEnvironment } from '@config/env';

/** Verifies the deployed payment, webhook, and provisioning safety foundation. */
async function verifyPaymentProvisioningDeployment(): Promise<void> {
	const client = new Client({ connectionString: getEnvironment().DATABASE_URL });
	try {
		await client.connect();
		const tables = await client.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('payment_attempts','payment_webhook_events','provisioning_jobs','workspace_resources') ORDER BY table_name`);
		const indexes = await client.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN ('payment_attempts_idempotency_unique','payment_webhook_events_provider_key_unique','provisioning_jobs_idempotency_unique','workspace_resources_provider_resource_unique') ORDER BY indexname`);
		const states = await client.query<{ enumlabel: string }>(`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=pg_enum.enumtypid WHERE typname='checkout_status' ORDER BY enumsortorder`);
		const permissions = await client.query<{ code: string }>(`SELECT code FROM platform_permissions WHERE deleted_at IS NULL AND (code LIKE 'payments.%' OR code LIKE 'provisioning.%') ORDER BY code`);
		if (tables.rowCount !== 4) throw new Error('Payment/provisioning tables are incomplete.');
		if (indexes.rowCount !== 4) throw new Error('Idempotency indexes are incomplete.');
		if (permissions.rowCount !== 8) throw new Error('Operational permissions are incomplete.');
		const requiredStates = ['awaiting_payment', 'payment_pending', 'workspace_setup_pending', 'provisioning', 'active', 'payment_failed', 'provisioning_failed'];
		const deployedStates = new Set(states.rows.map(({ enumlabel }) => enumlabel));
		if (!requiredStates.every((state) => deployedStates.has(state))) throw new Error('Checkout lifecycle states are incomplete.');
		console.info(JSON.stringify({ indexes: indexes.rows.map(({ indexname }) => indexname), permissions: permissions.rows.map(({ code }) => code), states: states.rows.map(({ enumlabel }) => enumlabel), tables: tables.rows.map(({ table_name }) => table_name) }));
	} finally { await client.end(); }
}

await verifyPaymentProvisioningDeployment();
