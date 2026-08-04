import { useEffect, useState } from 'react';

import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface Profile { displayName?: string; mobileE164?: string }

/** User identity and current authentication context. */
export default function ProfilePage() {
	const [user, setUser] = useState<Profile>({});
	useEffect(() => {
		const timeout = window.setTimeout(() => {
			void authenticatedFetch('/api/v1/auth/profile').then((response) => response.json()).then((body: { data?: Profile; status: boolean }) => {
				if (body.status && body.data) setUser(body.data);
			});
		}, 0);
		return () => window.clearTimeout(timeout);
	}, []);
	return (
		<div className="rounded-3xl border border-stone-200 bg-app-surface p-6 dark:border-stone-800 sm:p-8">
			<p className="text-sm font-semibold text-brand-primary dark:text-brand-action">Verified identity</p>
			<h2 className="mt-2 text-2xl font-semibold">Personal details</h2>
			<dl className="mt-8 grid gap-5 sm:grid-cols-2">
				<div><dt className="text-xs uppercase tracking-wide text-stone-500">Display name</dt><dd className="mt-1 font-medium">{user.displayName || 'Not provided'}</dd></div>
				<div><dt className="text-xs uppercase tracking-wide text-stone-500">WhatsApp number</dt><dd className="mt-1 font-medium">{user.mobileE164 || 'Verified number'}</dd></div>
				<div><dt className="text-xs uppercase tracking-wide text-stone-500">Sign-in method</dt><dd className="mt-1 font-medium">WhatsApp OTP</dd></div>
				<div><dt className="text-xs uppercase tracking-wide text-stone-500">Current context</dt><dd className="mt-1 font-medium">Platform administration</dd></div>
			</dl>
		</div>
	);
}
