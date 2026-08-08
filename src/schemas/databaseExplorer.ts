import { z } from 'zod';

const databaseIdentifierSchema = z
	.string()
	.trim()
	.min(1)
	.max(128)
	.refine((value) => !value.includes('\0'), 'Identifier contains an invalid character.');

const databaseValueRecordSchema = z
	.record(databaseIdentifierSchema, z.unknown())
	.refine((value) => Object.keys(value).length <= 100, 'At most 100 column values are allowed.');

const nonEmptyDatabaseValueRecordSchema = databaseValueRecordSchema
	.refine((value) => Object.keys(value).length > 0, 'At least one column value is required.');

export const databaseExplorerObjectQuerySchema = z
	.object({
		schema: databaseIdentifierSchema.optional(),
		table: databaseIdentifierSchema.optional(),
	})
	.strict()
	.refine((value) => !value.table || Boolean(value.schema), {
		message: 'Schema is required when a table is selected.',
		path: ['schema'],
	});

export const databaseExplorerRowsQuerySchema = z
	.object({
		schema: databaseIdentifierSchema,
		table: databaseIdentifierSchema,
		page: z.coerce.number().int().min(1).max(1_000_000).default(1),
		pageSize: z.coerce.number().int().min(10).max(100).default(25),
		sortColumn: databaseIdentifierSchema.optional(),
		sortDirection: z.enum(['asc', 'desc']).default('asc'),
		searchColumn: databaseIdentifierSchema.optional(),
		search: z.string().trim().max(500).optional(),
	})
	.strict()
	.refine((value) => !value.search || Boolean(value.searchColumn), {
		message: 'Choose a column before searching.',
		path: ['searchColumn'],
	});

export const databaseExplorerInsertRowSchema = z.object({
	schema: databaseIdentifierSchema,
	table: databaseIdentifierSchema,
	values: databaseValueRecordSchema,
}).strict();

export const databaseExplorerUpdateRowSchema = z.object({
	schema: databaseIdentifierSchema,
	table: databaseIdentifierSchema,
	key: nonEmptyDatabaseValueRecordSchema,
	values: nonEmptyDatabaseValueRecordSchema,
}).strict();

export const databaseExplorerDeleteRowsSchema = z.object({
	schema: databaseIdentifierSchema,
	table: databaseIdentifierSchema,
	keys: z.array(nonEmptyDatabaseValueRecordSchema).min(1).max(100),
	acceptedImpact: z.literal(true),
}).strict();

export const databaseAdvancedObjectMutationSchema = z.object({
	operation: z.enum(['create_or_replace', 'drop', 'refresh']),
	kind: z.enum(['event', 'function', 'materialized_view', 'procedure', 'sequence', 'trigger', 'view']),
	schema: databaseIdentifierSchema,
	name: databaseIdentifierSchema,
	tableName: databaseIdentifierSchema.optional(),
	definition: z.string().trim().max(100_000).optional(),
	signature: z.string().trim().max(1_000).optional(),
	acceptedImpact: z.boolean().default(false),
	confirmation: z.string().trim().max(300).optional(),
}).strict().superRefine((value, context) => {
	if (value.operation === 'create_or_replace' && !value.definition) context.addIssue({ code: 'custom', message: 'An object definition is required.', path: ['definition'] });
	if (value.kind === 'trigger' && !value.tableName) context.addIssue({ code: 'custom', message: 'A trigger table is required.', path: ['tableName'] });
	if (value.operation === 'refresh' && value.kind !== 'materialized_view') context.addIssue({ code: 'custom', message: 'Only materialized views can be refreshed.', path: ['kind'] });
	if (value.operation === 'drop' && (!value.acceptedImpact || value.confirmation !== `${value.schema}.${value.name}`)) context.addIssue({ code: 'custom', message: 'Dropping an object requires impact acceptance and exact schema.name confirmation.', path: ['confirmation'] });
});

export type DatabaseExplorerObjectQuery = z.infer<typeof databaseExplorerObjectQuerySchema>;
export type DatabaseExplorerRowsQuery = z.infer<typeof databaseExplorerRowsQuerySchema>;
export type DatabaseExplorerInsertRow = z.infer<typeof databaseExplorerInsertRowSchema>;
export type DatabaseExplorerUpdateRow = z.infer<typeof databaseExplorerUpdateRowSchema>;
export type DatabaseExplorerDeleteRows = z.infer<typeof databaseExplorerDeleteRowsSchema>;
export type DatabaseAdvancedObjectMutation = z.infer<typeof databaseAdvancedObjectMutationSchema>;
