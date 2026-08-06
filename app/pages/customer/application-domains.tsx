import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import { toast } from 'sonner';

import { DestructiveConfirmation, type DestructiveConfirmationValue } from '@components/ui/destructive-confirmation';
import { authenticatedFetch } from '@root/app/utils/authenticatedFetch';

interface Domain { hostname: string; id: string; isEnabled: boolean; isPrimary: boolean; status: string; tlsFailureReason?: string | null; tlsStatus: 'active' | 'failed' | 'pending' | 'provisioning'; type: 'custom' | 'platform'; verificationToken?: string | null }
interface ApiBody<T> { data?: T; message: string; status: boolean }

/** Send an authenticated API request and unwrap the standard response envelope. */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await authenticatedFetch(path, init);
	const body = await response.json() as ApiBody<T>;
	if (!response.ok || !body.status || body.data === undefined) throw new Error(body.message);
	return body.data;
}

export default function ApplicationDomainsPage() {
	const { active } = useOutletContext<{ active?: { publicId: number } }>();
	const { applicationId } = useParams();
	const [domains, setDomains] = useState<Domain[]>([]);
	const [deleting, setDeleting] = useState<Domain>();
	const [submitting, setSubmitting] = useState(false);
	const load = useCallback(async () => {
		if (!active || !applicationId) return;
		try { setDomains(await api(`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/domains`)); }
		catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to load domains.'); }
	}, [active, applicationId]);
	useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);

	/** Add an ownership-verification request for a custom hostname. */
	async function add(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		if (!active || !applicationId) return;
		const form = new FormData(event.currentTarget);
		try {
			await api(`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/domains`, { body: JSON.stringify({ hostname: form.get('hostname') }), headers: { 'content-type': 'application/json' }, method: 'POST' });
			event.currentTarget.reset();
			await load();
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add domain.'); }
	}

	/** Apply a primary-domain or platform-domain state transition. */
	async function act(domainId: string, action: 'set_primary' | 'toggle_platform', enabled?: boolean): Promise<void> {
		if (!active || !applicationId) return;
		try {
			await api(`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/domains/${domainId}`, { body: JSON.stringify({ action, enabled }), headers: { 'content-type': 'application/json' }, method: 'POST' });
			await load();
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update domain.'); }
	}

	/** Verify the TXT ownership record and request provider attachment. */
	async function verify(domainId: string): Promise<void> {
		if (!active || !applicationId) return;
		try {
			await api(`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/domains/${domainId}/verify`, { body: '{}', headers: { 'content-type': 'application/json' }, method: 'POST' });
			toast.success('Domain verified. TLS provisioning started.');
			await load();
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Verification failed.'); }
	}

	/** Refresh the observed HTTPS certificate state. */
	async function refreshTls(domainId: string): Promise<void> {
		if (!active || !applicationId) return;
		try {
			await api(`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/domains/${domainId}`, { body: JSON.stringify({ action: 'refresh_tls' }), headers: { 'content-type': 'application/json' }, method: 'POST' });
			await load();
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to check TLS.'); }
	}

	/** Remove a saved domain after explicit customer confirmation and server safety checks. */
	async function remove(domain: Domain, confirmation: DestructiveConfirmationValue): Promise<void> {
		if (!active || !applicationId) return;
		setSubmitting(true);
		try {
			await api(`/api/v1/workspaces/${active.publicId}/applications/${applicationId}/domains/${domain.id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(confirmation) });
			toast.success('Domain removed.');
			setDeleting(undefined);
			await load();
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to remove domain.'); } finally { setSubmitting(false); }
	}

	return <main className="mx-auto max-w-4xl">
		<Link className="font-semibold text-brand-primary dark:text-brand-action" to={`/dashboard/applications/${applicationId}`}>← Application</Link>
		<h2 className="mt-5 text-4xl font-black">Application domains</h2>
		<p className="mt-3 text-app-muted">Keep the platform hostname, connect custom domains, and choose the primary address.</p>
		<form className="mt-7 flex flex-col gap-3 rounded-3xl border border-brand-primary/10 bg-app-surface p-5 sm:flex-row" onSubmit={(event) => void add(event)}>
			<input className="min-w-0 flex-1 rounded-xl border border-brand-primary/15 bg-white px-4 py-3 text-gray-900 dark:bg-gray-800 dark:text-gray-100" name="hostname" placeholder="app.example.com" required />
			<button className="rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink" type="submit">Add custom domain</button>
		</form>
		<div className="mt-6 grid gap-4">{domains.map((domain) => <article className="rounded-3xl border border-brand-primary/10 bg-app-surface p-6" key={domain.id}>
			<div className="flex flex-wrap items-start justify-between gap-4"><div>
				<h3 className="font-bold">{domain.hostname}</h3>
				<p className="mt-1 text-sm capitalize text-app-muted">{domain.type} · {domain.status} · {domain.isEnabled ? 'enabled' : 'disabled'}{domain.isPrimary ? ' · primary' : ''}</p>
				<p className="mt-1 text-sm text-app-muted">TLS: <span className="capitalize">{domain.tlsStatus}</span></p>
				{domain.tlsFailureReason && <p className="mt-1 max-w-xl text-sm text-red-600 dark:text-red-300">{domain.tlsFailureReason}</p>}
			</div><div className="flex flex-wrap gap-2">
				{domain.type === 'custom' && domain.status !== 'verified' && <button className="rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={() => void verify(domain.id)} type="button">Verify</button>}
				{domain.status === 'verified' && domain.isEnabled && <button className="rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={() => void refreshTls(domain.id)} type="button">Check TLS</button>}
				{domain.status === 'verified' && domain.isEnabled && !domain.isPrimary && <button className="rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={() => void act(domain.id, 'set_primary')} type="button">Set primary</button>}
				{domain.type === 'platform' && <button className="rounded-xl border border-brand-primary/15 px-3 py-2 text-sm font-bold" onClick={() => void act(domain.id, 'toggle_platform', !domain.isEnabled)} type="button">{domain.isEnabled ? 'Disable' : 'Enable'}</button>}
				<button className="rounded-xl border border-red-300 px-3 py-2 text-sm font-bold text-red-700 dark:border-red-700 dark:text-red-300" onClick={() => setDeleting(domain)} type="button">Remove</button>
			</div></div>
			{domain.type === 'custom' && domain.status !== 'verified' && <div className="mt-4 rounded-2xl bg-brand-primary/5 p-4 text-sm"><p>Create this TXT record:</p><p className="mt-2 break-all font-mono">_qubit-verification.{domain.hostname}</p><p className="mt-1 break-all font-mono">{domain.verificationToken}</p></div>}
		</article>)}</div>
		{deleting && <DestructiveConfirmation busy={submitting} description="This detaches the hostname, removes managed DNS records, and updates the hosting provider. Traffic to this hostname will stop." onCancel={() => setDeleting(undefined)} onConfirm={(confirmation) => remove(deleting, confirmation)} resourceName={deleting.hostname} title="Remove Domain" />}
	</main>;
}
