import { describe, expect, it } from 'vitest';
import { createRuntimeImageSchema, updateRuntimeImageSchema } from '@schemas/runtimeImage';

describe('runtime image validation', () => {
	it('accepts a complete immutable image reference', () => { expect(createRuntimeImageSchema.safeParse({ code: 'node-24', defaultPort: 3000, isDefault: true, language: 'node', registry: 'ghcr.io', repository: 'qubitcodes/runtime-node', status: 'active', tag: '24.1.0', version: '24.1.0' }).success).toBe(true); });
	it('rejects empty updates and invalid ports', () => { expect(updateRuntimeImageSchema.safeParse({}).success).toBe(false); expect(updateRuntimeImageSchema.safeParse({ defaultPort: 70000 }).success).toBe(false); });
});
