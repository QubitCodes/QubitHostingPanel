import { z } from 'zod';

export const clusterCodeSchema = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
export const createDatabaseClusterSchema = z.object({
	code: clusterCodeSchema,
	engine: z.enum(['postgresql', 'mysql']),
	name: z.string().trim().min(2).max(160),
	maximumDatabases: z.number().int().positive().max(10000).default(250),
	limitsMemory: z.string().trim().regex(/^\d+(?:m|g)$/i).default('1g'),
	limitsCpus: z.string().trim().regex(/^\d+(?:\.\d+)?$/).default('1'),
});
export const updateDatabaseClusterSchema = z.object({ maximumDatabases: z.number().int().positive().max(10000).optional(), status: z.enum(['active', 'maintenance', 'unavailable', 'retired']).optional(), managementHost: z.string().trim().min(1).max(255).nullable().optional(), managementPort: z.number().int().min(1).max(65535).nullable().optional(), managementTlsMode: z.enum(['disabled', 'require', 'verify-full']).optional() }).refine((value) => Object.keys(value).length > 0);
export const createClusterBackupSchema = z.object({ frequency: z.string().trim().min(1).max(120).default('daily'), s3StorageUuid: z.string().trim().min(1).max(255).optional() });
export type CreateDatabaseClusterInput = z.infer<typeof createDatabaseClusterSchema>;
export type UpdateDatabaseClusterInput = z.infer<typeof updateDatabaseClusterSchema>;
export type CreateClusterBackupInput = z.infer<typeof createClusterBackupSchema>;
