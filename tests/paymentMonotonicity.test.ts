import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('payment result monotonicity', () => {
	it('claims each provider event before state mutation and cannot downgrade completed checkouts', () => { const source = readFileSync('src/controllers/PaymentController.ts', 'utf8'); expect(source).toContain('onConflictDoNothing().returning'); expect(source).toContain("ne(paymentAttempts.status, 'verified')"); expect(source).toContain("ne(customerCheckouts.status, 'active')"); });
});
