import { z } from 'zod';

export const databaseImportRequestSchema = z.object({
	confirmation: z.string().trim().min(1).max(255),
	mode: z.enum(['merge', 'replace']),
	schema: z.string().trim().min(1).max(128).optional(),
	table: z.string().trim().min(1).max(128).optional(),
	uploadToken: z.string().trim().min(40).max(4096),
}).strict();

export const databaseTransferExportRequestSchema = z.object({
	format: z.enum(['native', 'csv', 'json']),
	scope: z.enum(['database', 'table']),
	schema: z.string().trim().min(1).max(128).optional(),
	table: z.string().trim().min(1).max(128).optional(),
}).strict().superRefine((value, context) => {
	if (value.scope === 'database' && value.format !== 'native') context.addIssue({ code: 'custom', message: 'Full-database exports use native format.', path: ['format'] });
	if (value.scope === 'table' && value.format === 'native') context.addIssue({ code: 'custom', message: 'Table exports use CSV or JSON.', path: ['format'] });
	if (value.scope === 'table' && (!value.schema || !value.table)) context.addIssue({ code: 'custom', message: 'Schema and table are required for table exports.', path: ['table'] });
});

export const databaseTransferJobIdSchema = z.string().uuid();
export const databaseTransferJobActionSchema = z.object({ action: z.enum(['cancel', 'retry']) }).strict();

export type DatabaseImportRequest = z.infer<typeof databaseImportRequestSchema>;
export type DatabaseTransferExportRequest = z.infer<typeof databaseTransferExportRequestSchema>;
