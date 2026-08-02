import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import ApplicationLayout from '@root/app/layouts/application';

describe('application layout SSR', () => {
	it('renders without browser storage globals', () => {
		expect(() => renderToString(
			<MemoryRouter initialEntries={['/admin/overview']}>
				<Routes>
					<Route element={<ApplicationLayout />} path="/admin/overview" />
				</Routes>
			</MemoryRouter>
		)).not.toThrow();
	});
});
