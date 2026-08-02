import { Link } from 'react-router';

/** Account security explanation and direct route to session controls. */
export default function SecurityPage() {
	return <div className="rounded-3xl border border-stone-200 bg-app-surface p-6 dark:border-stone-800 sm:p-8"><p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Passwordless security</p><h2 className="mt-2 text-2xl font-semibold">Authentication</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 dark:text-stone-300">Your account uses verified WhatsApp one-time codes, short-lived access tokens, rotating refresh tokens, and individually revocable device sessions.</p><Link className="mt-7 inline-flex rounded-xl bg-brand-action px-4 py-2.5 text-sm font-semibold text-brand-ink" to="/settings/sessions">Manage signed-in devices</Link></div>;
}
