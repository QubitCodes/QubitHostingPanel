import { db } from '@db/client';
import { auditLogs, type NewAuditLog } from '@db/schema';

export type AuditLogInput = Omit<NewAuditLog, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'deleteReason'>;

/** Records an audit event when audit logging is enabled for the environment. */
export async function recordAuditLog(input: AuditLogInput): Promise<void> {
	if (process.env.ENABLE_AUDIT_LOG !== 'true') {
		return;
	}

	await db.insert(auditLogs).values(input);
}
