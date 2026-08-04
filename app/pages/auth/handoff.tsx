import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { getDeviceIdentifier } from '@root/app/utils/authenticatedFetch';

export default function AuthenticationHandoffPage() {
	const navigate = useNavigate();
	const [error, setError] = useState('');
	useEffect(() => { const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token'); if (!token) { setError('The panel handoff is missing.'); return; } window.history.replaceState({}, '', '/auth/handoff'); void fetch('/api/v1/auth/handoff/consume', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-id': getDeviceIdentifier() }, body: JSON.stringify({ token }) }).then(async (response) => { const body = await response.json() as { data?: { targetPath?: string; user?: Record<string, unknown> }; message: string; misc?: { accessToken?: string; refreshToken?: string }; status: boolean }; if (!response.ok || !body.status || !body.misc?.accessToken || !body.misc.refreshToken || !body.data?.targetPath) throw new Error(body.message); sessionStorage.setItem('accessToken', body.misc.accessToken); sessionStorage.setItem('refreshToken', body.misc.refreshToken); sessionStorage.setItem('authUser', JSON.stringify(body.data.user ?? {})); navigate(body.data.targetPath, { replace: true }); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Unable to establish the panel session.')); }, [navigate]);
	return <main className="grid min-h-screen place-items-center bg-app-canvas p-5 text-app-text"><section className="max-w-md rounded-3xl border border-brand-primary/10 bg-app-surface p-8 text-center">{error ? <><h1 className="text-2xl font-black">Unable to open the panel</h1><p className="mt-3 text-sm text-rose-500">{error}</p><a className="mt-6 inline-flex rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink" href="/login">Sign in again</a></> : <><LoaderCircle className="mx-auto size-7 animate-spin text-brand-primary dark:text-brand-action" /><h1 className="mt-5 text-2xl font-black">Opening your dashboard</h1><p className="mt-2 text-sm text-app-muted">Establishing a secure session on this panel domain.</p></>}</section></main>;
}
