import { describe, expect, it } from 'vitest';

import { deactivateGithubConnectionSchema } from '@schemas/githubConnection';

describe('GitHub connection validation', () => {
	it('requires explicit impact acknowledgement before deactivation', () => {
		expect(deactivateGithubConnectionSchema.safeParse({ acceptedImpact: true }).success).toBe(true);
		expect(deactivateGithubConnectionSchema.safeParse({ acceptedImpact: false }).success).toBe(false);
		expect(deactivateGithubConnectionSchema.safeParse({ acceptedImpact: true, unexpected: true }).success).toBe(false);
	});
});
