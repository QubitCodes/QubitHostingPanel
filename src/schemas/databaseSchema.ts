import { z } from 'zod';

const databaseIdentifierSchema = z
	.string()
	.trim()
	.min(1)
	.max(128)
	.refine((value) => !value.includes('\0'), 'Identifier contains an invalid character.');

export const databaseColumnTypeSchema = z.enum([
	'bigint',
	'boolean',
	'date',
	'decimal',
	'double',
	'integer',
	'json',
	'string',
	'text',
	'timestamp',
	'uuid',
]);

const databaseDefaultSchema = z
	.discriminatedUnion('kind', [
		z.object({ kind: z.literal('none') }).strict(),
		z.object({ kind: z.literal('null') }).strict(),
		z.object({ kind: z.literal('current_timestamp') }).strict(),
		z.object({ kind: z.literal('literal'), value: z.union([z.boolean(), z.number().finite(), z.string().max(2_000)]) }).strict(),
	])
	.default({ kind: 'none' });

export const databaseColumnDefinitionSchema = z
	.object({
		name: databaseIdentifierSchema,
		type: databaseColumnTypeSchema,
		length: z.number().int().min(1).max(65_535).optional(),
		precision: z.number().int().min(1).max(65).optional(),
		scale: z.number().int().min(0).max(30).optional(),
		nullable: z.boolean().default(true),
		primaryKey: z.boolean().default(false),
		autoIncrement: z.boolean().default(false),
		default: databaseDefaultSchema,
	})
	.strict()
	.superRefine((column, context) => {
		if (column.length !== undefined && column.type !== 'string') context.addIssue({ code: 'custom', message: 'Length is supported only for string columns.', path: ['length'] });
		if ((column.precision !== undefined || column.scale !== undefined) && column.type !== 'decimal') context.addIssue({ code: 'custom', message: 'Precision and scale are supported only for decimal columns.', path: ['precision'] });
		if (column.scale !== undefined && column.precision === undefined) context.addIssue({ code: 'custom', message: 'Precision is required when scale is supplied.', path: ['precision'] });
		if (column.scale !== undefined && column.precision !== undefined && column.scale > column.precision) context.addIssue({ code: 'custom', message: 'Scale cannot exceed precision.', path: ['scale'] });
		if (column.autoIncrement && !['bigint', 'integer'].includes(column.type)) context.addIssue({ code: 'custom', message: 'Auto increment requires an integer column.', path: ['autoIncrement'] });
		if (column.primaryKey && column.nullable) context.addIssue({ code: 'custom', message: 'Primary-key columns cannot be nullable.', path: ['nullable'] });
	});

const objectTargetSchema = {
	schema: databaseIdentifierSchema,
	table: databaseIdentifierSchema,
};

const destructiveTargetSchema = {
	...objectTargetSchema,
	acceptedImpact: z.literal(true),
	confirmation: z.string().trim().min(1).max(300),
};

const indexColumnSchema = z.object({
	name: databaseIdentifierSchema,
	direction: z.enum(['asc', 'desc']).default('asc'),
}).strict();

export const databaseSchemaMutationSchema = z.discriminatedUnion('operation', [
	z.object({ operation: z.literal('create_schema'), schema: databaseIdentifierSchema }).strict(),
	z.object({ operation: z.literal('rename_schema'), schema: databaseIdentifierSchema, newName: databaseIdentifierSchema }).strict(),
	z.object({ operation: z.literal('drop_schema'), schema: databaseIdentifierSchema, acceptedImpact: z.literal(true), confirmation: z.string().trim().min(1).max(300) }).strict(),
	z.object({ operation: z.literal('create_table'), ...objectTargetSchema, columns: z.array(databaseColumnDefinitionSchema).min(1).max(100) }).strict()
		.refine((value) => new Set(value.columns.map(({ name }) => name)).size === value.columns.length, { message: 'Column names must be unique.', path: ['columns'] }),
	z.object({ operation: z.literal('rename_table'), ...objectTargetSchema, newName: databaseIdentifierSchema }).strict(),
	z.object({ operation: z.literal('drop_table'), ...destructiveTargetSchema }).strict(),
	z.object({ operation: z.literal('truncate_table'), ...destructiveTargetSchema }).strict(),
	z.object({ operation: z.literal('add_column'), ...objectTargetSchema, column: databaseColumnDefinitionSchema }).strict(),
	z.object({ operation: z.literal('alter_column'), ...objectTargetSchema, columnName: databaseIdentifierSchema, column: databaseColumnDefinitionSchema, acceptedImpact: z.literal(true), confirmation: z.string().trim().min(1).max(300) }).strict(),
	z.object({ operation: z.literal('drop_column'), ...destructiveTargetSchema, columnName: databaseIdentifierSchema }).strict(),
	z.object({ operation: z.literal('create_index'), ...objectTargetSchema, indexName: databaseIdentifierSchema, columns: z.array(indexColumnSchema).min(1).max(32), unique: z.boolean().default(false) }).strict(),
	z.object({ operation: z.literal('drop_index'), ...objectTargetSchema, indexName: databaseIdentifierSchema, acceptedImpact: z.literal(true), confirmation: z.string().trim().min(1).max(300) }).strict(),
	z.object({ operation: z.literal('add_primary_key'), ...objectTargetSchema, constraintName: databaseIdentifierSchema, columns: z.array(databaseIdentifierSchema).min(1).max(32) }).strict(),
	z.object({
		operation: z.literal('add_foreign_key'),
		...objectTargetSchema,
		constraintName: databaseIdentifierSchema,
		columns: z.array(databaseIdentifierSchema).min(1).max(32),
		referenceSchema: databaseIdentifierSchema,
		referenceTable: databaseIdentifierSchema,
		referenceColumns: z.array(databaseIdentifierSchema).min(1).max(32),
		onDelete: z.enum(['cascade', 'no_action', 'restrict', 'set_null']).default('no_action'),
		onUpdate: z.enum(['cascade', 'no_action', 'restrict', 'set_null']).default('no_action'),
	}).strict().refine((value) => value.columns.length === value.referenceColumns.length, { message: 'Foreign-key column counts must match.', path: ['referenceColumns'] }),
	z.object({ operation: z.literal('drop_constraint'), ...objectTargetSchema, constraintName: databaseIdentifierSchema, acceptedImpact: z.literal(true), confirmation: z.string().trim().min(1).max(300) }).strict(),
]);

export type DatabaseColumnDefinition = z.infer<typeof databaseColumnDefinitionSchema>;
export type DatabaseSchemaMutation = z.infer<typeof databaseSchemaMutationSchema>;
