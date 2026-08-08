import { describe, expect, it } from 'vitest';

import { databaseAdvancedObjectMutationSchema, databaseExplorerDeleteRowsSchema, databaseExplorerInsertRowSchema, databaseExplorerObjectQuerySchema, databaseExplorerRowsQuerySchema, databaseExplorerUpdateRowSchema } from '@schemas/databaseExplorer';
import { advancedObjectStatements } from '@services/databases/databaseAdvancedObjectService';

describe('database explorer validation', () => {
	it('accepts bounded, URL-derived table pagination', () => {
		expect(databaseExplorerRowsQuerySchema.parse({ schema: 'public', table: 'users', page: '2', pageSize: '50', sortDirection: 'desc' })).toEqual({
			schema: 'public',
			table: 'users',
			page: 2,
			pageSize: 50,
			sortDirection: 'desc',
		});
	});

	it('requires a selected search column and rejects oversized pages', () => {
		expect(databaseExplorerRowsQuerySchema.safeParse({ schema: 'public', table: 'users', search: 'jayak' }).success).toBe(false);
		expect(databaseExplorerRowsQuerySchema.safeParse({ schema: 'public', table: 'users', pageSize: '500' }).success).toBe(false);
	});

	it('requires schema context when describing one object', () => {
		expect(databaseExplorerObjectQuerySchema.safeParse({ table: 'users' }).success).toBe(false);
		expect(databaseExplorerObjectQuerySchema.safeParse({ schema: 'public', table: 'users' }).success).toBe(true);
	});

	it('rejects null bytes and unexpected query parameters', () => {
		expect(databaseExplorerRowsQuerySchema.safeParse({ schema: 'public\0admin', table: 'users' }).success).toBe(false);
		expect(databaseExplorerObjectQuerySchema.safeParse({ debug: 'true' }).success).toBe(false);
	});

	it('validates bounded row mutations and destructive acknowledgement', () => {
		expect(databaseExplorerInsertRowSchema.safeParse({ schema: 'public', table: 'users', values: { name: 'Jayak' } }).success).toBe(true);
		expect(databaseExplorerInsertRowSchema.safeParse({ schema: 'public', table: 'settings', values: {} }).success).toBe(true);
		expect(databaseExplorerUpdateRowSchema.safeParse({ schema: 'public', table: 'users', key: { id: 1 }, values: { name: 'Jayak' } }).success).toBe(true);
		expect(databaseExplorerDeleteRowsSchema.safeParse({ schema: 'public', table: 'users', keys: [{ id: 1 }], acceptedImpact: false }).success).toBe(false);
		expect(databaseExplorerDeleteRowsSchema.safeParse({ schema: 'public', table: 'users', keys: Array.from({ length: 101 }, (_, id) => ({ id })), acceptedImpact: true }).success).toBe(false);
	});

	it('models advanced-object changes and exact destructive confirmation', () => {
		expect(databaseAdvancedObjectMutationSchema.safeParse({ operation: 'drop', kind: 'view', schema: 'public', name: 'summary', acceptedImpact: true, confirmation: 'public.summary' }).success).toBe(true);
		expect(databaseAdvancedObjectMutationSchema.safeParse({ operation: 'drop', kind: 'view', schema: 'public', name: 'summary', acceptedImpact: true, confirmation: 'summary' }).success).toBe(false);
		expect(advancedObjectStatements('postgresql', { operation: 'create_or_replace', kind: 'view', schema: 'public', name: 'summary', definition: 'SELECT id FROM users', acceptedImpact: false })).toEqual(['CREATE OR REPLACE VIEW "public"."summary" AS SELECT id FROM users']);
		expect(advancedObjectStatements('mysql', { operation: 'create_or_replace', kind: 'event', schema: 'app', name: 'cleanup', definition: 'CREATE EVENT app.cleanup ON SCHEDULE EVERY 1 DAY DO DELETE FROM logs WHERE expired = 1', acceptedImpact: false })).toHaveLength(2);
	});

	it('blocks mismatched and administrative advanced-object definitions', () => {
		expect(() => advancedObjectStatements('postgresql', { operation: 'create_or_replace', kind: 'view', schema: 'public', name: 'safe_view', definition: 'DELETE FROM users', acceptedImpact: false })).toThrow(/read-only|SELECT/);
		expect(() => advancedObjectStatements('postgresql', { operation: 'create_or_replace', kind: 'function', schema: 'public', name: 'safe_fn', definition: 'CREATE FUNCTION public.other() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$', acceptedImpact: false })).toThrow(/exact schema and name/);
		expect(() => advancedObjectStatements('postgresql', { operation: 'create_or_replace', kind: 'function', schema: 'public', name: 'safe_fn', definition: 'CREATE FUNCTION public.safe_fn() RETURNS void LANGUAGE sql AS $$ CREATE ROLE root $$', acceptedImpact: false })).toThrow(/Administrative/);
	});
});
