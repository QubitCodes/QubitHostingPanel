/** User identity and current authentication context. */
export default function ProfilePage() {
	let user: { displayName?: string; mobileE164?: string } = {};
	try {
		if (typeof sessionStorage !== 'undefined')
			user = JSON.parse(sessionStorage.getItem('authUser') ?? '{}');
	} catch {
		/* Empty profile fallback. */
	}
	return (
		<div className="rounded-3xl border border-stone-200 bg-app-surface p-6 dark:border-stone-800 sm:p-8">
			<p className="text-sm font-semibold text-brand-primary dark:text-brand-action">
				Verified identity
			</p>
			<h2 className="mt-2 text-2xl font-semibold">Personal details</h2>
			<dl className="mt-8 grid gap-5 sm:grid-cols-2">
				<div>
					<dt className="text-xs uppercase tracking-wide text-stone-500">
						Display name
					</dt>
					<dd className="mt-1 font-medium">
						{user.displayName || 'Not provided'}
					</dd>
				</div>
				<div>
					<dt className="text-xs uppercase tracking-wide text-stone-500">
						WhatsApp number
					</dt>
					<dd className="mt-1 font-medium">
						{user.mobileE164 || 'Verified number'}
					</dd>
				</div>
				<div>
					<dt className="text-xs uppercase tracking-wide text-stone-500">
						Sign-in method
					</dt>
					<dd className="mt-1 font-medium">WhatsApp OTP</dd>
				</div>
				<div>
					<dt className="text-xs uppercase tracking-wide text-stone-500">
						Current context
					</dt>
					<dd className="mt-1 font-medium">Platform administration</dd>
				</div>
			</dl>
		</div>
	);
}
