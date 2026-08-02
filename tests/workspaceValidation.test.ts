import { describe, expect, it } from 'vitest';

import { getTableConfig } from 'drizzle-orm/pg-core';

import { customers, organisations, workspaceMemberships, workspaces } from '@db/schema';
import { convertWorkspaceToOrganisationSchema, createWorkspaceSchema, customerPublicIdSchema, workspacePublicIdSchema } from '@schemas/workspace';

describe('workspace validation', () => {
	it('accepts Personal and Organisation Workspace creation payloads', () => {
		expect(createWorkspaceSchema.safeParse({ name: 'Jayak Personal', slug: 'jayak-personal', type: 'personal' }).success).toBe(true);
		expect(createWorkspaceSchema.safeParse({ name: 'Qubit Codes', slug: 'qubit-codes', type: 'organisation', organisation: { displayName: 'Qubit Codes', legalName: 'Qubit Codes Private Limited', gstin: null } }).success).toBe(true);
	});

	it('keeps organisation data consistent with workspace type', () => {
		expect(createWorkspaceSchema.safeParse({ name: 'Qubit Codes', slug: 'qubit-codes', type: 'organisation' }).success).toBe(false);
		expect(createWorkspaceSchema.safeParse({ name: 'Personal', slug: 'personal', type: 'personal', organisation: { displayName: 'Unexpected' } }).success).toBe(false);
	});

	it('requires contact country code and mobile together', () => {
		expect(convertWorkspaceToOrganisationSchema.safeParse({ displayName: 'Qubit Codes', contactCountryCode: '+91' }).success).toBe(false);
		expect(convertWorkspaceToOrganisationSchema.safeParse({ displayName: 'Qubit Codes', contactCountryCode: '+91', contactMobile: '9400000000' }).success).toBe(true);
	});

	it('accepts only six-digit public IDs', () => {
		expect(customerPublicIdSchema.safeParse(100000).success).toBe(true);
		expect(workspacePublicIdSchema.safeParse(100000).success).toBe(true);
		expect(workspacePublicIdSchema.safeParse(999999).success).toBe(true);
		expect(workspacePublicIdSchema.safeParse(10000).success).toBe(false);
	});

	it('defines the customer, workspace, membership, and organisation tenancy tables', () => {
		expect(getTableConfig(customers).name).toBe('customers');
		expect(getTableConfig(workspaces).name).toBe('workspaces');
		expect(getTableConfig(workspaceMemberships).foreignKeys).toHaveLength(2);
		expect(getTableConfig(organisations).foreignKeys).toHaveLength(1);
	});
});
