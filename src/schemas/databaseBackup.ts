import { z } from 'zod';

export const databaseBackupPublicIdSchema = z.uuid();
export const restoreDatabaseBackupSchema = z.object({ confirmation: z.string().trim().min(1).max(120) });
export type RestoreDatabaseBackupRequest = z.infer<typeof restoreDatabaseBackupSchema>;
