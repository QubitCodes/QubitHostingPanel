import { describe, expect, it } from 'vitest';

import { databaseExplorerDeleteRowsSchema, databaseExplorerInsertRowSchema, databaseExplorerObjectQuerySchema, databaseExplorerRowsQuerySchema, databaseExplorerUpdateRowSchema } from '@schemas/databaseExplorer';

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
});
