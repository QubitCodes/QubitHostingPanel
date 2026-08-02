import {
	Bell,
	BookOpen,
	ChevronLeft,
	ChevronRight,
	EllipsisVertical,
	LogOut,
	Menu,
	Moon,
	PackageOpen,
	Search,
	Server,
	Settings,
	Shield,
	Sun,
	UserRound,
	X,
} from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';

import {
	authenticatedFetch,
	clearAuthentication,
} from '@root/app/utils/authenticatedFetch';
import {
	FullScreenMenuContext,
	type FullScreenMenuState,
} from '@root/app/contexts/full-screen-menu';

const navigation = [
	{ label: 'Overview', path: '/admin/overview', icon: Server },
	{ label: 'Packages', path: '/admin/packages', icon: PackageOpen },
	{ label: 'Administrators', path: '/admin/administrators', icon: Shield },
	{ label: 'Settings', path: '/settings/profile', icon: Settings },
];

const titles: Record<string, string> = {
	'/admin/overview': 'Overview',
	'/admin/packages': 'Packages',
	'/admin/administrators': 'Administrators',
	'/settings/profile': 'Profile settings',
	'/settings/security': 'Security settings',
	'/settings/sessions': 'Active sessions',
};

function pageTitle(pathname: string): string {
	return (
		titles[pathname] ??
		(pathname.startsWith('/admin/packages/')
			? 'Package details'
			: pathname.startsWith('/admin/administrators/')
			? 'Administrator details'
			: pathname.startsWith('/settings/sessions/')
				? 'Session details'
				: pathname.startsWith('/search/')
					? 'Search'
					: 'Qubit Hosting')
	);
}

/** Authenticated application frame shared by platform and account routes. */
export default function ApplicationLayout() {
	const navigate = useNavigate();
	const location = useLocation();
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [dark, setDark] = useState(false);
	const [query, setQuery] = useState('');
	const [user, setUser] = useState<{
		displayName?: string;
		mobileE164?: string;
	}>({});
	const [fullScreenMenu, setFullScreenMenu] = useState<FullScreenMenuState>();
	const [adminContextReady, setAdminContextReady] = useState(false);
	const [canViewApiDocs, setCanViewApiDocs] = useState(false);
	const adminRoute = location.pathname.startsWith('/admin/');

	useEffect(() => {
		const timeout = window.setTimeout(() => {
			const storedTheme = localStorage.getItem('theme');
			setDark(
				storedTheme === 'dark' ||
					(!storedTheme &&
						window.matchMedia('(prefers-color-scheme: dark)').matches),
			);
			try {
				setUser(
					JSON.parse(sessionStorage.getItem('authUser') ?? '{}') as {
						displayName?: string;
						mobileE164?: string;
					},
				);
			} catch {
				setUser({});
			}
			setCanViewApiDocs(
				sessionStorage.getItem('canViewApiDocs') === 'true',
			);
			if (!sessionStorage.getItem('accessToken'))
				navigate('/login', { replace: true });
		}, 0);
		return () => window.clearTimeout(timeout);
	}, [navigate]);

	useEffect(() => {
		const timeout = window.setTimeout(() => {
			const accessToken = sessionStorage.getItem('accessToken');
			if (!accessToken) {
				navigate('/login', { replace: true });
				return;
			}
			void authenticatedFetch('/api/v1/auth/context', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ context: 'admin' }),
			})
				.then(async (response) => {
					const body = (await response.json()) as {
						data?: { canViewApiDocs?: boolean };
						message: string;
						misc?: { accessToken?: string };
						status: boolean;
					};
					if (!response.ok || !body.status || !body.misc?.accessToken)
						throw new Error(body.message);
					sessionStorage.setItem('accessToken', body.misc.accessToken);
					const docsAllowed = body.data?.canViewApiDocs === true;
					sessionStorage.setItem('canViewApiDocs', String(docsAllowed));
					setCanViewApiDocs(docsAllowed);
					setAdminContextReady(true);
				})
				.catch((error) => {
					setAdminContextReady(false);
					setCanViewApiDocs(false);
					sessionStorage.setItem('canViewApiDocs', 'false');
					if (adminRoute) {
						toast.error(
							error instanceof Error
								? error.message
								: 'Unable to enter admin context.',
						);
						navigate('/settings/profile', { replace: true });
					}
				});
		}, 0);
		return () => window.clearTimeout(timeout);
	}, [adminRoute, navigate]);

	useEffect(() => {
		document.documentElement.classList.toggle('dark', dark);
	}, [dark]);

	useEffect(() => {
		document.documentElement.style.setProperty(
			'--app-sidebar-width',
			collapsed ? '5rem' : '16rem',
		);
		return () => {
			document.documentElement.style.removeProperty('--app-sidebar-width');
		};
	}, [collapsed]);

	function toggleTheme(): void {
		const next = !dark;
		setDark(next);
		localStorage.setItem('theme', next ? 'dark' : 'light');
		document.documentElement.classList.toggle('dark', next);
	}

	async function logout(): Promise<void> {
		try {
			await authenticatedFetch('/api/v1/auth/logout', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}',
			});
		} finally {
			clearAuthentication();
			navigate('/login');
		}
	}

	function search(event: FormEvent): void {
		event.preventDefault();
		if (query.trim()) navigate(`/search/${encodeURIComponent(query.trim())}`);
	}

	const sidebar = (
		<>
			<div className="flex h-20 items-center justify-between px-4">
				<NavLink
					className="flex items-center gap-3 overflow-hidden"
					to="/admin/overview"
				>
					<span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-action font-bold text-brand-ink">
						Q
					</span>
					{!collapsed && (
						<span className="whitespace-nowrap font-semibold tracking-tight">
							Qubit Hosting
						</span>
					)}
				</NavLink>
				<button className="lg:hidden" onClick={() => setMobileOpen(false)}>
					<X className="size-5" />
				</button>
			</div>
			<nav className="flex-1 space-y-1 px-3">
				{navigation.map(({ icon: Icon, ...item }) => (
					<NavLink
						className={({ isActive }) =>
							`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${isActive ? 'bg-brand-muted text-brand-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
						}
						key={item.path}
						onClick={() => setMobileOpen(false)}
						to={item.path}
					>
						<Icon className="size-5 shrink-0" />
						{!collapsed && item.label}
					</NavLink>
				))}
			</nav>
			<div className="m-3 mb-2 rounded-2xl border border-white/10 bg-white/5 p-3">
				{!collapsed && (
					<div className="mb-4">
						<p className="text-[11px] font-semibold uppercase tracking-[.16em] text-white/50">
							Company credits
						</p>
						<p className="mt-1 text-sm text-white">
							Available with billing
						</p>
					</div>
				)}
				<div className="flex items-center gap-3">
					<span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10">
						<UserRound className="size-4" />
					</span>
					{!collapsed && (
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-semibold">
								{user.displayName || 'Account'}
							</p>
							<p className="truncate text-xs text-white/55">
								{user.mobileE164 || 'Verified identity'}
							</p>
						</div>
					)}
					<details
						className="group relative"
						onBlur={(event) => {
							const next = event.relatedTarget;
							if (!(next instanceof Node) || !event.currentTarget.contains(next))
								event.currentTarget.removeAttribute('open');
						}}
					>
						<summary
							aria-label="Open account menu"
							className="list-none rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white [&::-webkit-details-marker]:hidden"
						>
							<EllipsisVertical className="size-4" />
						</summary>
						<div className="absolute bottom-full right-0 z-50 mb-2 w-48 overflow-hidden rounded-xl border border-stone-200 bg-white p-1 text-stone-800 shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100">
							<NavLink
								className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
								onClick={(event) =>
									event.currentTarget.closest('details')?.removeAttribute('open')
								}
								to="/settings/profile"
							>
								<UserRound className="size-4" />
								Profile
							</NavLink>
							{canViewApiDocs && (
								<a
									className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800"
									href="/api/docs"
									onClick={(event) =>
										event.currentTarget
											.closest('details')
											?.removeAttribute('open')
									}
									rel="noreferrer"
									target="_blank"
								>
									<BookOpen className="size-4" />
									API Docs
								</a>
							)}
							<button
								className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
								onClick={(event) => {
									event.currentTarget
										.closest('details')
										?.removeAttribute('open');
									void logout();
								}}
							>
								<LogOut className="size-4" />
								Logout
							</button>
						</div>
					</details>
				</div>
			</div>
			{!collapsed && (
				<p className="mb-3 px-4 text-center text-[11px] text-white/45">
					Developed by{' '}
					<a
						className="font-semibold text-brand-muted hover:text-white"
						href="https://qubit.codes"
						rel="noreferrer"
						target="_blank"
					>
						Qubit Codes
					</a>
				</p>
			)}
		</>
	);

	return (
		<FullScreenMenuContext.Provider
			value={{ menu: fullScreenMenu, setMenu: setFullScreenMenu }}
		>
			<div className="min-h-screen bg-app-canvas text-app-text">
				<aside
					className={`fixed inset-y-0 left-0 z-50 hidden flex-col bg-brand-primary text-white transition-[width] lg:flex ${collapsed ? 'w-20' : 'w-64'}`}
				>
					{sidebar}
					<button
						aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
						className="absolute -right-3 top-24 grid size-7 place-items-center rounded-full bg-brand-action text-brand-ink shadow"
						onClick={() => setCollapsed(!collapsed)}
					>
						{collapsed ? (
							<ChevronRight className="size-4" />
						) : (
							<ChevronLeft className="size-4" />
						)}
					</button>
				</aside>
				{mobileOpen && (
					<aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-brand-primary text-white shadow-2xl lg:hidden">
						{sidebar}
					</aside>
				)}
				<div
					className={`transition-[padding] ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}
				>
					<header className="sticky top-0 z-30 flex h-20 items-center gap-3 border-b border-stone-200/80 bg-app-canvas/90 px-4 backdrop-blur-xl dark:border-stone-800 sm:px-6">
						<button
							className="rounded-xl p-2 hover:bg-stone-200 dark:hover:bg-stone-800 lg:hidden"
							onClick={() => setMobileOpen(true)}
						>
							<Menu className="size-5" />
						</button>
						{fullScreenMenu && (
							<button
								aria-label="Close full-screen menu"
								className="rounded-xl p-2 hover:bg-stone-200 dark:hover:bg-stone-800"
								onClick={fullScreenMenu.onClose}
							>
								<X className="size-5" />
							</button>
						)}
						<div className="min-w-0">
							<p className="text-xs font-medium text-brand-primary dark:text-brand-action">
								Control centre
							</p>
							<h1 className="truncate text-lg font-semibold">
								{fullScreenMenu?.title ?? pageTitle(location.pathname)}
							</h1>
						</div>
						<form
							className="ml-auto hidden w-full max-w-sm sm:block"
							onSubmit={search}
						>
							<label className="relative block">
								<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
								<input
									className="w-full rounded-xl border border-stone-200 bg-white/70 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-action dark:border-stone-700 dark:bg-stone-900 dark:text-white"
									onChange={(event) => setQuery(event.target.value)}
									placeholder="Search the panel"
									value={query}
								/>
							</label>
						</form>
						<button
							aria-label="Notifications"
							className="rounded-xl p-2.5 hover:bg-stone-200 dark:hover:bg-stone-800"
						>
							<Bell className="size-5" />
						</button>
						<button
							aria-label="Toggle theme"
							className="rounded-xl p-2.5 hover:bg-stone-200 dark:hover:bg-stone-800"
							onClick={toggleTheme}
						>
							{dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
						</button>
					</header>
					<main className="p-4 sm:p-6 lg:p-8">
						{!adminRoute || adminContextReady ? (
							<Outlet />
						) : (
							<div className="animate-pulse space-y-4">
								<div className="h-8 w-52 rounded-lg bg-stone-200 dark:bg-stone-800" />
								<div className="h-48 rounded-3xl bg-stone-200 dark:bg-stone-800" />
							</div>
						)}
					</main>
				</div>
			</div>
		</FullScreenMenuContext.Provider>
	);
}
