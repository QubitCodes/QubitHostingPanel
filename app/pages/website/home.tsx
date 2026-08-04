import {
	ArrowRight,
	Boxes,
	Check,
	ChevronDown,
	ChevronRight,
	CloudCog,
	Database,
	Gauge,
	Globe2,
	Menu,
	LogOut,
	Moon,
	ShieldCheck,
	Sun,
	X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLoaderData } from 'react-router';

import { PublicCommerceController } from '@controllers/PublicCommerceController';
import { authenticatedFetch, clearAuthentication } from '@root/app/utils/authenticatedFetch';
import { openPanelPath } from '@root/app/utils/panelNavigation';

interface CatalogueEntitlement {
	booleanValue: boolean | null;
	code: string;
	isUnlimited: boolean;
	name: string;
	numericValue: number | null;
	unit: string | null;
}

interface CataloguePrice {
	amountMinor: number;
	billingInterval: 'month' | 'year';
	id: string;
	intervalCount: number;
}

interface CataloguePackage {
	categoryName: string | null;
	description: string | null;
	entitlements: CatalogueEntitlement[];
	id: string;
	isFeatured: boolean;
	name: string;
	prices: CataloguePrice[];
	slug: string;
	trialDuration: number | null;
	trialDurationUnit: 'day' | 'month' | 'week' | null;
	trialEnabled: boolean;
}

interface BillingTerm {
	billingInterval: 'month' | 'year';
	intervalCount: number;
	label: string;
}

const BILLING_TERMS: BillingTerm[] = [
	{ billingInterval: 'month', intervalCount: 1, label: 'Monthly' },
	{ billingInterval: 'year', intervalCount: 1, label: 'Yearly' },
	{ billingInterval: 'year', intervalCount: 2, label: '2 years' },
	{ billingInterval: 'year', intervalCount: 3, label: '3 years' },
];

const FEATURES = [
	{ description: 'Applications, databases, domains, and services in one calm operational view.', icon: Boxes, title: 'One working surface' },
	{ description: 'Versioned prices and entitlements keep every purchase understandable months later.', icon: Gauge, title: 'Commercial truth' },
	{ description: 'Your workspace stays portable while Coolify handles the infrastructure execution.', icon: CloudCog, title: 'Provider-aware, not locked in' },
	{ description: 'Passwordless WhatsApp access with revocable sessions across every device.', icon: ShieldCheck, title: 'Secure by default' },
];

const FAQS = [
	['What is a workspace?', 'A workspace is your independent hosting, billing, subscription, and resource boundary. You can keep personal work separate from an organisation.'],
	['Do I need another password?', 'No. Qubit Hosting uses a verified WhatsApp OTP and device-aware, revocable sessions.'],
	['Where is the infrastructure hosted?', 'Current plans are designed around AWS compute, storage, backup, and transactional email services, operated through a managed platform layer.'],
	['Can I change plans later?', 'The subscription model preserves what you purchased while allowing explicit, auditable plan changes instead of silently rewriting your limits.'],
];

const money = (amountMinor: number) => `₹${(amountMinor / 100).toLocaleString('en-IN')}`;

/** Public hosting landing page and customer-registration entry surface. */
export async function loader(): Promise<CataloguePackage[]> {
	const response = await PublicCommerceController.catalogue();
	const body = await response.json() as { data?: CataloguePackage[]; status: boolean };
	return response.ok && body.status ? body.data ?? [] : [];
}

/** Public hosting landing page and customer-registration entry surface. */
export default function HomePage() {
	const catalogue = useLoaderData<typeof loader>();
	return <LandingPage catalogue={catalogue} />;
}

/** Renderable landing content separated from route data loading for deterministic SSR tests. */
export function LandingPage({ catalogue }: { catalogue: CataloguePackage[] }) {
	const [dark, setDark] = useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [authUser, setAuthUser] = useState<{ displayName?: string; hasAdminAccess?: boolean; hasCustomerDashboardAccess?: boolean }>();
	const [term, setTerm] = useState<BillingTerm>(BILLING_TERMS[0]);

	useEffect(() => {
		const timeout = window.setTimeout(() => {
			const storedTheme = localStorage.getItem('theme');
			const initialDark = storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
			setDark(initialDark);
			document.documentElement.classList.toggle('dark', initialDark);
			if (sessionStorage.getItem('accessToken')) {
				setAuthUser(JSON.parse(sessionStorage.getItem('authUser') ?? '{}'));
				void authenticatedFetch('/api/v1/auth/profile').then((response) => response.json()).then((body: { data?: { displayName?: string; hasAdminAccess?: boolean; hasCustomerDashboardAccess?: boolean }; status: boolean }) => {
					if (!body.status || !body.data) return;
					sessionStorage.setItem('authUser', JSON.stringify(body.data));
					setAuthUser(body.data);
				});
			}
		}, 0);
		return () => window.clearTimeout(timeout);
	}, []);

	useEffect(() => {
		const interceptPanelNavigation = (event: MouseEvent) => {
			const anchor = (event.target as Element | null)?.closest('a');
			if (!anchor) return;
			const path = new URL(anchor.href, window.location.href).pathname;
			if (path !== '/dashboard' && path !== '/admin/overview') return;
			event.preventDefault();
			void openPanelPath(path).catch(() => window.location.assign(path));
		};
		document.addEventListener('click', interceptPanelNavigation);
		return () => document.removeEventListener('click', interceptPanelNavigation);
	}, []);

	function toggleTheme() {
		const next = !dark;
		setDark(next);
		localStorage.setItem('theme', next ? 'dark' : 'light');
		document.documentElement.classList.toggle('dark', next);
	}
	const panelDestination = authUser?.hasCustomerDashboardAccess ? '/dashboard' : authUser?.hasAdminAccess ? '/admin/overview' : undefined;

	return <main className="min-h-screen overflow-hidden bg-app-canvas text-app-text">
		<header className="sticky top-0 z-50 border-b border-brand-primary/10 bg-app-canvas/90 backdrop-blur-xl dark:border-white/10">
			<div className="mx-auto flex h-20 max-w-[90rem] items-center justify-between px-5 sm:px-8 lg:px-12">
				<a className="flex items-center gap-3" href="#top"><span className="grid size-10 place-items-center rounded-xl bg-brand-primary text-lg font-black text-brand-action">Q</span><span><span className="block text-sm font-bold tracking-tight">Qubit Hosting</span><span className="block text-[10px] font-semibold uppercase tracking-[.2em] text-app-muted">Managed cloud</span></span></a>
				<nav className="hidden items-center gap-8 text-sm font-medium lg:flex"><a className="transition hover:text-brand-primary dark:hover:text-brand-action" href="#platform">Platform</a><a className="transition hover:text-brand-primary dark:hover:text-brand-action" href="#plans">Plans</a><a className="transition hover:text-brand-primary dark:hover:text-brand-action" href="#process">How it works</a><a className="transition hover:text-brand-primary dark:hover:text-brand-action" href="#faq">FAQ</a></nav>
				<div className="flex items-center gap-2"><button aria-label="Toggle colour theme" className="grid size-10 place-items-center rounded-xl border border-brand-primary/15 bg-app-surface text-brand-primary transition hover:border-brand-action dark:text-brand-action" onClick={toggleTheme} type="button">{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>{authUser ? <AccountMenu user={authUser} /> : <Link className="hidden rounded-xl border border-brand-primary/20 px-4 py-2.5 text-sm font-semibold text-brand-primary transition hover:border-brand-action dark:text-brand-action sm:block" to="/login">Sign in</Link>}<a className="hidden items-center gap-2 rounded-xl bg-brand-action px-4 py-2.5 text-sm font-bold text-brand-ink sm:inline-flex" href="#plans">View plans <ArrowRight className="size-4" /></a><button aria-label="Toggle navigation" className="grid size-10 place-items-center rounded-xl lg:hidden" onClick={() => setMobileMenuOpen((current) => !current)} type="button">{mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button></div>
			</div>
			{mobileMenuOpen && <nav className="border-t border-brand-primary/10 bg-app-surface px-5 py-5 lg:hidden"><div className="grid gap-1">{[['Platform', '#platform'], ['Plans', '#plans'], ['How it works', '#process'], ['FAQ', '#faq']].map(([label, href]) => <a className="rounded-xl px-3 py-3 text-sm font-semibold hover:bg-brand-muted/15" href={href} key={href} onClick={() => setMobileMenuOpen(false)}>{label}</a>)}{panelDestination && <Link className="mt-2 rounded-xl bg-brand-action px-4 py-3 text-center text-sm font-bold text-brand-ink" to={panelDestination}>Open panel</Link>}{!authUser && <Link className="mt-2 rounded-xl bg-brand-action px-4 py-3 text-center text-sm font-bold text-brand-ink" to="/login">Sign in</Link>}</div></nav>}
		</header>

		<section className="relative" id="top">
			<div className="absolute inset-x-0 top-0 -z-0 h-[38rem] bg-[radial-gradient(circle_at_75%_20%,color-mix(in_srgb,var(--theme-brand-action)_18%,transparent),transparent_42%)]" />
			<div className="relative mx-auto grid max-w-[90rem] gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.08fr_.92fr] lg:px-12 lg:py-36">
				<div className="max-w-4xl"><p className="inline-flex items-center gap-2 rounded-full border border-brand-action/30 bg-brand-action/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[.16em] text-brand-primary dark:text-brand-action"><span className="size-1.5 rounded-full bg-brand-action" /> Built for serious small teams</p><h1 className="mt-8 text-5xl font-black leading-[.94] tracking-[-.065em] sm:text-7xl lg:text-[6.6rem]">Hosting that feels<br /><span className="text-brand-primary dark:text-brand-action">under control.</span></h1><p className="mt-7 max-w-2xl text-lg leading-8 text-app-muted sm:text-xl">Deploy applications, keep commercial limits honest, and see the state of your operation without assembling another fragile stack of dashboards.</p><div className="mt-10 flex flex-col gap-3 sm:flex-row"><a className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-action px-6 py-4 font-bold text-brand-ink" href="#plans">Explore plans <ArrowRight className="size-4" /></a>{panelDestination ? <Link className="inline-flex items-center justify-center gap-2 rounded-2xl border border-brand-primary/20 bg-app-surface px-6 py-4 font-bold text-brand-primary dark:text-brand-action" to={panelDestination}>Continue to your panel <ChevronRight className="size-4" /></Link> : !authUser ? <Link className="inline-flex items-center justify-center gap-2 rounded-2xl border border-brand-primary/20 bg-app-surface px-6 py-4 font-bold text-brand-primary dark:text-brand-action" to="/login">Already have an account? <ChevronRight className="size-4" /></Link> : null}</div><div className="mt-12 flex flex-wrap gap-x-7 gap-y-3 text-sm text-app-muted">{['WhatsApp OTP', 'AWS-backed infrastructure', 'Clear plan limits'].map((item) => <span className="flex items-center gap-2" key={item}><Check className="size-4 text-brand-action" />{item}</span>)}</div></div>
				<div className="relative self-center"><div className="absolute -inset-6 -z-0 rotate-3 rounded-[2.5rem] bg-brand-muted/20" /><div className="relative overflow-hidden rounded-[2rem] border border-brand-primary/15 bg-brand-primary p-5 text-white shadow-2xl shadow-brand-primary/20 sm:p-7"><div className="flex items-center justify-between border-b border-white/10 pb-5"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-action">Workspace pulse</p><p className="mt-1 font-semibold">Production</p></div><span className="rounded-full bg-brand-action/15 px-3 py-1 text-xs font-semibold text-brand-action">All systems ready</span></div><div className="mt-6 grid grid-cols-2 gap-3"><Metric label="Applications" value="08" /><Metric label="Databases" value="05" /><Metric label="Deployments" value="24" /><Metric label="Incidents" value="00" /></div><div className="mt-6 rounded-2xl bg-black/15 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Latest deployment</p><span className="text-xs text-white/55">2m ago</span></div><div className="mt-4 grid grid-cols-[auto_1fr_auto] items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-brand-action text-brand-ink"><Globe2 className="size-4" /></span><div><p className="text-sm font-semibold">customer-portal</p><p className="text-xs text-white/55">main · 8fd2c10</p></div><span className="text-xs font-semibold text-brand-action">Live</span></div></div><div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 p-4"><Database className="size-5 text-brand-action" /><div><p className="text-sm font-semibold">Usage remains visible</p><p className="text-xs text-white/55">Current, reserved, and plan limits stay separate.</p></div></div></div></div>
			</div>
		</section>

		<section className="border-y border-brand-primary/10 bg-app-surface" id="platform"><div className="mx-auto max-w-[90rem] px-5 py-20 sm:px-8 lg:px-12"><div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary dark:text-brand-action">A better operating model</p><h2 className="mt-4 text-4xl font-black tracking-[-.045em] sm:text-5xl">Less dashboard.<br />More direction.</h2></div><div className="grid gap-px overflow-hidden rounded-3xl border border-brand-primary/10 bg-brand-primary/10 sm:grid-cols-2">{FEATURES.map(({ description, icon: Icon, title }) => <article className="bg-app-surface p-6 sm:p-8" key={title}><Icon className="size-6 text-brand-primary dark:text-brand-action" /><h3 className="mt-8 text-lg font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-app-muted">{description}</p></article>)}</div></div></div></section>

		<section className="mx-auto w-full max-w-[90rem] scroll-mt-24 px-5 py-24 sm:px-8 lg:px-12 lg:py-32" id="plans"><div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary dark:text-brand-action">Straightforward plans</p><h2 className="mt-4 text-4xl font-black tracking-[-.045em] sm:text-6xl">Start focused.<br />Scale deliberately.</h2><p className="mt-5 max-w-xl text-app-muted">All prices exclude GST. Your checkout is recalculated and signed by the server.</p></div><div className="flex w-fit flex-wrap gap-1 rounded-2xl border border-brand-primary/10 bg-app-surface p-1.5">{BILLING_TERMS.map((item) => <button className={`rounded-xl px-3 py-2 text-xs font-bold transition sm:px-4 ${term.billingInterval === item.billingInterval && term.intervalCount === item.intervalCount ? 'bg-brand-primary text-white dark:bg-brand-action dark:text-brand-ink' : 'text-app-muted hover:text-app-text'}`} key={`${item.billingInterval}:${item.intervalCount}`} onClick={() => setTerm(item)} type="button">{item.label}</button>)}</div></div><div className="plans-grid mt-12 grid w-full gap-5">{catalogue.map((item, index) => <PackageCard item={item} key={item.id} position={index} term={term} />)}{catalogue.length === 0 && <div className="rounded-3xl border border-brand-primary/10 bg-app-surface p-8 text-app-muted">Published plans are temporarily unavailable. Please check again shortly.</div>}</div></section>

		<section className="bg-brand-primary text-white" id="process"><div className="mx-auto max-w-[90rem] px-5 py-24 sm:px-8 lg:px-12 lg:py-32"><div className="grid gap-12 lg:grid-cols-[.72fr_1.28fr]"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand-action">From plan to production</p><h2 className="mt-4 text-4xl font-black tracking-[-.045em] sm:text-5xl">A clear path,<br />without the theatre.</h2></div><ol className="grid gap-8 sm:grid-cols-3">{[['01', 'Choose a plan', 'Pick a term and see exactly what the workspace receives.'], ['02', 'Verify your identity', 'Use your WhatsApp number—no password lifecycle to maintain.'], ['03', 'Launch your workspace', 'Billing, limits, resources, and deployment history stay together.']].map(([number, title, description]) => <li className="border-t border-white/20 pt-5" key={number}><span className="text-xs font-black text-brand-action">{number}</span><h3 className="mt-8 text-xl font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-white/65">{description}</p></li>)}</ol></div></div></section>

		<section className="mx-auto grid max-w-[90rem] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[.72fr_1.28fr] lg:px-12 lg:py-32" id="faq"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary dark:text-brand-action">Useful answers</p><h2 className="mt-4 text-4xl font-black tracking-[-.045em] sm:text-5xl">Before you<br />move anything.</h2></div><div className="divide-y divide-brand-primary/10 border-y border-brand-primary/10">{FAQS.map(([question, answer]) => <details className="group py-6" key={question}><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold"><span>{question}</span><span className="grid size-8 place-items-center rounded-full border border-brand-primary/15 text-lg transition group-open:rotate-45">+</span></summary><p className="max-w-2xl pt-4 text-sm leading-7 text-app-muted">{answer}</p></details>)}</div></section>

		<section className="px-5 pb-8 sm:px-8 lg:px-12"><div className="mx-auto max-w-[90rem] overflow-hidden rounded-[2rem] bg-brand-action px-6 py-14 text-brand-ink sm:px-10 lg:flex lg:items-center lg:justify-between lg:px-16 lg:py-16"><div><p className="text-xs font-black uppercase tracking-[.2em]">Ready when you are</p><h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-.045em] sm:text-5xl">Give your next deployment a proper home.</h2></div><div className="mt-8 flex shrink-0 flex-col gap-3 sm:flex-row lg:mt-0"><a className="rounded-2xl bg-brand-primary px-6 py-4 text-center font-bold text-white" href="#plans">Compare plans</a>{panelDestination ? <Link className="rounded-2xl border border-brand-ink/20 px-6 py-4 text-center font-bold" to={panelDestination}>Open panel</Link> : !authUser ? <Link className="rounded-2xl border border-brand-ink/20 px-6 py-4 text-center font-bold" to="/login">Sign in</Link> : null}</div></div></section>

		<footer className="mx-auto flex max-w-[90rem] flex-col gap-5 px-5 py-10 text-sm text-app-muted sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-brand-primary text-xs font-black text-brand-action">Q</span><span>Qubit Hosting · Developed by <a className="font-semibold text-app-text hover:text-brand-primary dark:hover:text-brand-action" href="https://qubit.codes" rel="noreferrer" target="_blank">Qubit Codes</a></span></div><div className="flex gap-5"><a href="#plans">Plans</a><a href="#faq">FAQ</a><Link to="/login">Sign in</Link></div></footer>
	</main>;
}

function AccountMenu({ user }: { user: { displayName?: string; hasAdminAccess?: boolean; hasCustomerDashboardAccess?: boolean } }) {
	const [open, setOpen] = useState(false);
	async function logout(): Promise<void> { await authenticatedFetch('/api/v1/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); clearAuthentication(); window.location.assign('/'); }
	return <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}><button aria-expanded={open} className="flex items-center gap-2 rounded-xl border border-brand-primary/20 px-3 py-2.5 text-sm font-semibold" onClick={() => setOpen((current) => !current)} type="button"><span className="max-w-32 truncate">{user.displayName ?? 'Account'}</span><ChevronDown className="size-4" /></button>{open && <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-2xl border border-brand-primary/10 bg-app-surface p-2 shadow-2xl">{user.hasCustomerDashboardAccess && <Link className="block rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-brand-muted/15" onClick={() => setOpen(false)} to="/dashboard">Dashboard</Link>}{user.hasAdminAccess && <Link className="block rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-brand-muted/15" onClick={() => setOpen(false)} to="/admin/overview">Admin Dashboard</Link>}<button className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-500 hover:bg-rose-500/10" onClick={() => void logout()} type="button"><LogOut className="size-4" /> Logout</button></div>}</div>;
}

/** Small metric tile used by the product preview. */
function Metric({ label, value }: { label: string; value: string }) {
	return <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-2xl font-black tracking-tight text-brand-action">{value}</p><p className="mt-1 text-xs text-white/55">{label}</p></div>;
}

/** Published package card driven by server-owned catalogue data. */
function PackageCard({ item, position, term }: { item: CataloguePackage; position: number; term: BillingTerm }) {
	const price = item.prices.find((candidate) => candidate.billingInterval === term.billingInterval && candidate.intervalCount === term.intervalCount);
	const monthlyEquivalent = price ? Math.round(price.amountMinor / (term.billingInterval === 'month' ? 1 : term.intervalCount * 12)) : null;
	const billingLabel = term.intervalCount === 1
			? 'Billed yearly'
			: `Billed every ${term.intervalCount} years`;
	const trialLabel = item.trialEnabled && item.trialDuration && item.trialDurationUnit
		? `${item.trialDuration}-${item.trialDurationUnit}${item.trialDuration === 1 ? '' : 's'} free trial`
		: null;
	const visibleEntitlements = useMemo(() => item.entitlements.filter((entry) => entry.isUnlimited || entry.booleanValue === true || entry.numericValue !== null).slice(0, 6), [item.entitlements]);
	return <article className={`relative flex min-h-[31rem] min-w-0 max-w-full flex-col overflow-hidden rounded-[2rem] border p-6 sm:p-8 ${position === 1 ? 'border-brand-action bg-brand-primary text-white shadow-xl shadow-brand-primary/15' : 'border-brand-primary/10 bg-app-surface'}`}>{position === 1 && <span className="absolute right-6 top-6 rounded-full bg-brand-action px-3 py-1 text-[10px] font-black uppercase tracking-[.14em] text-brand-ink">Most popular</span>}<p className={`text-xs font-bold uppercase tracking-[.18em] ${position === 1 ? 'text-brand-action' : 'text-brand-primary dark:text-brand-action'}`}>{item.categoryName ?? 'Hosting plan'}</p><h3 className="mt-5 text-3xl font-black tracking-tight">{item.name}</h3><p className={`mt-3 min-h-12 text-sm leading-6 ${position === 1 ? 'text-white/65' : 'text-app-muted'}`}>{item.description}</p><div className="mt-7"><p className="text-4xl font-black tracking-[-.04em]">{price ? <>{money(monthlyEquivalent ?? 0)}<span className="ml-1 text-base font-semibold tracking-normal">/month</span></> : 'Unavailable'}</p>{price && term.billingInterval !== 'month' && <p className={`mt-1 text-xs ${position === 1 ? 'text-white/55' : 'text-app-muted'}`}>{billingLabel} at {money(price.amountMinor)}</p>}{!price && <p className={`mt-1 text-xs ${position === 1 ? 'text-white/55' : 'text-app-muted'}`}>No {term.label.toLowerCase()} price</p>}</div>{trialLabel && <p className={`mt-4 text-xs font-semibold ${position === 1 ? 'text-brand-action' : 'text-brand-primary dark:text-brand-action'}`}>{trialLabel} · No card required</p>}<ul className={`mt-7 min-w-0 space-y-3 border-t pt-6 text-sm ${position === 1 ? 'border-white/15' : 'border-brand-primary/10'}`}>{visibleEntitlements.map((entry) => <li className="flex min-w-0 items-start gap-3" key={entry.code}><Check className={`mt-0.5 size-4 shrink-0 ${position === 1 ? 'text-brand-action' : 'text-brand-primary dark:text-brand-action'}`} /><span className="min-w-0 break-words">{entitlementLabel(entry)}</span></li>)}</ul><div className="mt-auto pt-8"><Link aria-disabled={!price} className={`inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-center font-bold sm:px-5 ${position === 1 ? 'bg-brand-action text-brand-ink' : 'bg-brand-primary text-white dark:bg-brand-action dark:text-brand-ink'} ${!price ? 'pointer-events-none opacity-50' : ''}`} to={price ? `/checkout/${item.slug}/${price.id}` : '/#plans'}><span className="min-w-0 truncate">Choose {item.name}</span> <ArrowRight className="size-4 shrink-0" /></Link></div></article>;
}

function entitlementLabel(entry: CatalogueEntitlement): string {
	if (entry.isUnlimited) return `Unlimited ${entry.name.toLowerCase()}`;
	if (entry.booleanValue === true) return entry.name;
	return `${entry.numericValue?.toLocaleString('en-IN')} ${entry.unit ?? entry.name.toLowerCase()}`;
}
