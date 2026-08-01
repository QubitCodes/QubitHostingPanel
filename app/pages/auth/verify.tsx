import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';

import { getDeviceIdentifier } from '@root/app/utils/authenticatedFetch';

const codeSchema = z.object({ otp: z.string().regex(/^\d{6}$/, 'Enter the six-digit code.') });
type CodeForm = z.infer<typeof codeSchema>;

/** Verifies the URL-addressed OTP challenge and enters the strongest permitted context. */
export default function VerifyLoginPage() {
	const { challengeId } = useParams(); const navigate = useNavigate();
	const form = useForm<CodeForm>({ resolver: zodResolver(codeSchema), defaultValues: { otp: '' } });
	async function verify(values: CodeForm): Promise<void> {
		try {
			const response = await fetch('/api/v1/auth/otp/verify', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-id': getDeviceIdentifier() }, body: JSON.stringify({ challengeId, otp: values.otp }) });
			const body = await response.json() as { data?: { user?: { displayName?: string; id: string } }; message: string; misc?: { accessToken?: string; refreshToken?: string }; status: boolean };
			if (!response.ok || !body.status || !body.misc?.accessToken || !body.misc.refreshToken) throw new Error(body.message);
			sessionStorage.setItem('accessToken', body.misc.accessToken); sessionStorage.setItem('refreshToken', body.misc.refreshToken); sessionStorage.setItem('authUser', JSON.stringify(body.data?.user ?? {}));
			const contextResponse = await fetch('/api/v1/auth/context', { method: 'POST', headers: { authorization: `Bearer ${body.misc.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ context: 'admin' }) });
			const context = await contextResponse.json() as { misc?: { accessToken?: string }; status: boolean };
			if (contextResponse.ok && context.status && context.misc?.accessToken) { sessionStorage.setItem('accessToken', context.misc.accessToken); navigate('/admin/administrators'); return; }
			navigate('/settings/profile');
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to verify OTP.'); }
	}
	return <main className="flex min-h-screen items-center justify-center bg-[#f4f2ec] px-5 py-12 text-stone-950 dark:bg-[#111513] dark:text-white"><section className="w-full max-w-md rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-40px_rgba(18,60,50,.45)] dark:border-stone-700 dark:bg-[#1b211e] sm:p-9"><Link className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-teal-800 dark:text-stone-300" to="/login"><ArrowLeft className="size-4" />Back</Link><p className="mt-8 text-sm font-semibold text-teal-700 dark:text-[#e0ff71]">Check WhatsApp</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">Enter your verification code</h1><p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">We sent a six-digit code to the registered number ending in {sessionStorage.getItem('pendingMobile')?.slice(-4) || '••••'}.</p><form className="mt-8 space-y-5" onSubmit={form.handleSubmit(verify)}><Controller control={form.control} name="otp" render={({ field, fieldState }) => <label className="block"><input {...field} autoComplete="one-time-code" autoFocus className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-4 text-center font-mono text-3xl tracking-[.35em] text-stone-950 outline-none focus:border-teal-700 dark:border-stone-700 dark:bg-[#111513] dark:text-white" inputMode="numeric" maxLength={6} placeholder="000000" />{fieldState.error && <span className="mt-1.5 block text-center text-xs text-rose-600">{fieldState.error.message}</span>}</label>} /><button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#123c32] px-4 py-3.5 font-semibold text-white dark:bg-[#e0ff71] dark:text-[#123c32]" disabled={form.formState.isSubmitting} type="submit">{form.formState.isSubmitting ? 'Verifying…' : 'Verify and continue'}<ArrowRight className="size-4" /></button></form></section></main>;
}
