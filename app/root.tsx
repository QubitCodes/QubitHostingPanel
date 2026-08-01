import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration
} from 'react-router';
import { Toaster } from 'sonner';

import stylesheet from './app.css?url';

export const links = () => [{ rel: 'stylesheet', href: stylesheet }];

export const meta = () => [
	{ title: 'Qubit Hosting Panel' },
	{
		name: 'description',
		content: 'Hosting commerce, subscriptions, entitlements, and customer resources.'
	},
	{ name: 'viewport', content: 'width=device-width, initial-scale=1' }
];

/** Root document shared by public, customer, administration, and API documentation views. */
export default function App() {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<Meta />
				<Links />
			</head>
			<body className="bg-slate-50 text-slate-950 antialiased dark:bg-slate-950 dark:text-slate-50">
				<Outlet />
				<Toaster richColors theme="system" />
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}
