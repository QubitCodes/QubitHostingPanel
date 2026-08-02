import { describe, expect, it } from 'vitest';

import { normalizeNullableText } from '@root/app/utils/formValues';

describe('normalizeNullableText', () => {
	it('normalizes nullish and blank form values to null', () => {
		expect(normalizeNullableText(null)).toBeNull();
		expect(normalizeNullableText(undefined)).toBeNull();
		expect(normalizeNullableText('   ')).toBeNull();
	});

	it('trims a populated form value', () => {
		expect(normalizeNullableText('  LAUNCH10  ')).toBe('LAUNCH10');
	});
});
