import { z } from 'zod';

export const databaseBackupPublicIdSchema = z.uuid();
export const restoreDatabaseBackupSchema = z.object({ confirmation: z.string().trim().min(1).max(120) });
export const databaseBackupScheduleSchema = z.object({ frequencyHours: z.coerce.number().int().min(1).max(8760), isEnabled: z.boolean(), retentionDays: z.coerce.number().int().min(1).max(3650) });
export const cloneDatabaseBackupSchema = z.object({ targetDatabaseId: z.uuid(), confirmation: z.string().trim().min(1).max(120) });
export type RestoreDatabaseBackupRequest = z.infer<typeof restoreDatabaseBackupSchema>;
export type DatabaseBackupScheduleRequest = z.infer<typeof databaseBackupScheduleSchema>;
export type CloneDatabaseBackupRequest = z.infer<typeof cloneDatabaseBackupSchema>;
