import { KeyRound, MonitorSmartphone, UserRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';

const sections = [{ to: '/settings/profile', label: 'Profile', icon: UserRound }, { to: '/settings/security', label: 'Security', icon: KeyRound }, { to: '/settings/sessions', label: 'Sessions', icon: MonitorSmartphone }];

/** Settings frame with its own URL-addressed section navigation. */
export default function SettingsLayout() {
	return <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[220px_1fr]"><aside><p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-stone-500">Account settings</p><nav className="flex gap-2 overflow-x-auto lg:flex-col">{sections.map(({ icon: Icon, ...section }) => <NavLink className={({ isActive }) => `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-brand-muted text-brand-ink' : 'hover:bg-stone-200 dark:hover:bg-stone-800'}`} key={section.to} to={section.to}><Icon className="size-4" />{section.label}</NavLink>)}</nav></aside><section className="min-w-0"><Outlet /></section></div>;
}
