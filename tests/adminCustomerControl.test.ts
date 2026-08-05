import { describe, expect, it } from 'vitest';
import { adminApplicationActionSchema, adminApplicationFileReadSchema, adminSessionRevokeSchema, adminUserPublicIdSchema, adminUserStatusSchema } from '@schemas/adminCustomerControl';

describe('administrator customer control validation', () => {
	it('accepts only six-digit user public IDs', () => { expect(adminUserPublicIdSchema.safeParse('100001').data).toBe(100001); expect(adminUserPublicIdSchema.safeParse('99999').success).toBe(false); });
	it('requires reasons for account and session mutations', () => { expect(adminUserStatusSchema.safeParse({ status: 'suspended', reason: 'Confirmed abuse investigation.' }).success).toBe(true); expect(adminUserStatusSchema.safeParse({ status: 'suspended', reason: 'x' }).success).toBe(false); expect(adminSessionRevokeSchema.safeParse({ reason: 'Requested by account owner.' }).success).toBe(true); });
	it('keeps file paths inside the repository', () => { expect(adminApplicationFileReadSchema.safeParse({ path: 'src/index.ts' }).success).toBe(true); expect(adminApplicationFileReadSchema.safeParse({ path: '../.env' }).success).toBe(false); expect(adminApplicationFileReadSchema.safeParse({ path: '/etc/passwd' }).success).toBe(false); });
	it('allows only explicit application lifecycle actions with a reason', () => { expect(adminApplicationActionSchema.safeParse({ action: 'restart', reason: 'Recover customer application health.' }).success).toBe(true); expect(adminApplicationActionSchema.safeParse({ action: 'delete', reason: 'Not supported here.' }).success).toBe(false); expect(adminApplicationActionSchema.safeParse({ action: 'stop', reason: 'x' }).success).toBe(false); });
});
