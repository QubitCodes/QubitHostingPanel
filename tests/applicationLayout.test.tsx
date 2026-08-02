import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import ApplicationLayout from '@root/app/layouts/application';
import ProfilePage from '@root/app/pages/account/profile';
import AdminsPage from '@root/app/pages/admin/admins';
import VerifyLoginPage from '@root/app/pages/auth/verify';

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

	it('server-renders administrator routes without the browser location global', () => {
		expect(() => renderToString(
			<MemoryRouter initialEntries={['/admin/administrators']}>
				<Routes><Route element={<AdminsPage />} path="/admin/administrators" /></Routes>
			</MemoryRouter>
		)).not.toThrow();
	});

	it('server-renders authentication and profile views without session storage', () => {
		expect(() => renderToString(
			<MemoryRouter initialEntries={['/login/verify/00000000-0000-4000-8000-000000000000']}>
				<Routes><Route element={<VerifyLoginPage />} path="/login/verify/:challengeId" /></Routes>
			</MemoryRouter>
		)).not.toThrow();
		expect(() => renderToString(<ProfilePage />)).not.toThrow();
	});
});
