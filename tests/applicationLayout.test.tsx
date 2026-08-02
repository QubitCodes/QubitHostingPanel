import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import ApplicationLayout from '@root/app/layouts/application';
import { Offcanvas } from '@root/app/components/ui/offcanvas';
import { PhoneNumberInput } from '@root/app/components/forms/phone-number-input';
import ProfilePage from '@root/app/pages/account/profile';
import AdminsPage from '@root/app/pages/admin/admins';
import VerifyLoginPage from '@root/app/pages/auth/verify';

describe('application layout SSR', () => {
	it('renders without browser storage globals', () => {
		expect(() =>
			renderToString(
				<MemoryRouter initialEntries={['/admin/overview']}>
					<Routes>
						<Route element={<ApplicationLayout />} path="/admin/overview" />
					</Routes>
				</MemoryRouter>,
			),
		).not.toThrow();
	});

	it('server-renders administrator routes without the browser location global', () => {
		expect(() =>
			renderToString(
				<MemoryRouter initialEntries={['/admin/administrators']}>
					<Routes>
						<Route element={<AdminsPage />} path="/admin/administrators" />
					</Routes>
				</MemoryRouter>,
			),
		).not.toThrow();
		expect(() =>
			renderToString(
				<MemoryRouter
					initialEntries={['/admin/administrators/123456/edit/basic']}
				>
					<Routes>
						<Route
							element={<AdminsPage />}
							path="/admin/administrators/:adminId/edit/:section"
						/>
					</Routes>
				</MemoryRouter>,
			),
		).not.toThrow();
	});

	it('server-renders authentication and profile views without session storage', () => {
		expect(() =>
			renderToString(
				<MemoryRouter
					initialEntries={[
						'/login/verify/00000000-0000-4000-8000-000000000000',
					]}
				>
					<Routes>
						<Route
							element={<VerifyLoginPage />}
							path="/login/verify/:challengeId"
						/>
					</Routes>
				</MemoryRouter>,
			),
		).not.toThrow();
		expect(() => renderToString(<ProfilePage />)).not.toThrow();
	});

	it('renders a full offcanvas below the topbar and within the live sidebar edge', () => {
		const html = renderToString(
			<Offcanvas onClose={() => undefined} title="Test drawer" width="full">
				<p>Drawer content</p>
			</Offcanvas>,
		);
		expect(html).toContain('top-20');
		expect(html).toContain('lg:left-[var(--app-sidebar-width,16rem)]');
		expect(html).toContain('max-w-none');
	});

	it('renders the reusable themed phone input without duplicating the country name', () => {
		const html = renderToString(
			<PhoneNumberInput
				countryCode="+91"
				id="mobile"
				mobile="9400143527"
				onChange={() => undefined}
			/>,
		);
		expect(html).toContain('IN');
		expect(html).toContain('+91');
		expect(html).not.toContain('India');
		expect(html).toContain('dark:bg-stone-900');
	});
});
