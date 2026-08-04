import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

import { getDeviceIdentifier } from '@root/app/utils/authenticatedFetch';
import { safeAuthenticationReturn } from '@root/app/utils/authReturn';
import { openPanelPath } from '@root/app/utils/panelNavigation';

const codeSchema = z.object({
	otp: z.string().regex(/^\d{6}$/, 'Enter the six-digit code.'),
});
type CodeForm = z.infer<typeof codeSchema>;
interface PendingOtpIdentity { countryCode?: string; mobile: string }

/** Remove transient OTP identity data when the flow completes or is abandoned. */
function clearPendingOtp(): void {
	sessionStorage.removeItem('pendingMobile');
	sessionStorage.removeItem('pendingOtpIdentity');
	sessionStorage.removeItem('pendingOtpResendAvailableAt');
}

/** Verifies the URL-addressed OTP challenge and enters the strongest permitted context. */
export default function VerifyLoginPage() {
	const { challengeId } = useParams();
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const returnTo = safeAuthenticationReturn(searchParams.get('returnTo'));
	const [pendingMobile, setPendingMobile] = useState('••••');
	const [pendingIdentity, setPendingIdentity] = useState<PendingOtpIdentity>();
	const [resendAvailableAt, setResendAvailableAt] = useState(0);
	const [remainingSeconds, setRemainingSeconds] = useState(0);
	const [resending, setResending] = useState(false);
	useEffect(() => {
		const timeout = window.setTimeout(() => {
			setPendingMobile(sessionStorage.getItem('pendingMobile') || '••••');
			try {
				const storedIdentity = sessionStorage.getItem('pendingOtpIdentity');
				if (storedIdentity) setPendingIdentity(JSON.parse(storedIdentity) as PendingOtpIdentity);
				else {
					const legacyMobile = sessionStorage.getItem('pendingMobile') ?? '';
					const parsed = parsePhoneNumberFromString(legacyMobile);
					setPendingIdentity(parsed ? { countryCode: `+${parsed.countryCallingCode}`, mobile: parsed.nationalNumber } : legacyMobile ? { mobile: legacyMobile } : undefined);
				}
			} catch { sessionStorage.removeItem('pendingOtpIdentity'); }
			const storedResendAt = Date.parse(sessionStorage.getItem('pendingOtpResendAvailableAt') ?? '');
			if (Number.isFinite(storedResendAt)) setResendAvailableAt(storedResendAt);
		}, 0);
		return () => window.clearTimeout(timeout);
	}, []);
	useEffect(() => {
		function updateRemaining(): void { setRemainingSeconds(Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000))); }
		updateRemaining();
		if (!resendAvailableAt) return;
		const interval = window.setInterval(updateRemaining, 1000);
		return () => window.clearInterval(interval);
	}, [resendAvailableAt]);
	const form = useForm<CodeForm>({
		resolver: zodResolver(codeSchema),
		defaultValues: { otp: '' },
	});
	async function verify(values: CodeForm): Promise<void> {
		try {
			const response = await fetch('/api/v1/auth/otp/verify', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-device-id': getDeviceIdentifier(),
				},
				body: JSON.stringify({ challengeId, otp: values.otp }),
			});
			const body = (await response.json()) as {
				data?: { user?: { displayName?: string; hasAdminAccess?: boolean; hasCustomerDashboardAccess?: boolean; id: string } };
				message: string;
				misc?: { accessToken?: string; refreshToken?: string };
				status: boolean;
			};
			if (
				!response.ok ||
				!body.status ||
				!body.misc?.accessToken ||
				!body.misc.refreshToken
			)
				throw new Error(body.message);
			sessionStorage.setItem('accessToken', body.misc.accessToken);
			sessionStorage.setItem('refreshToken', body.misc.refreshToken);
			sessionStorage.setItem('authUser', JSON.stringify(body.data?.user ?? {}));
			clearPendingOtp();
			const user = body.data?.user;
			if (returnTo) navigate(returnTo);
			else if (user?.hasCustomerDashboardAccess) await openPanelPath('/dashboard');
			else if (user?.hasAdminAccess) await openPanelPath('/admin/overview');
			else navigate('/');
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Unable to verify OTP.',
			);
		}
	}
	async function resendOtp(): Promise<void> {
		if (!pendingIdentity) { toast.error('Return to login and enter your mobile number again.'); return; }
		setResending(true);
		try {
			const response = await fetch('/api/v1/auth/otp/resend', {
				body: JSON.stringify({ challengeId }),
				headers: { 'content-type': 'application/json', 'x-device-id': getDeviceIdentifier() },
				method: 'POST',
			});
			const body = await response.json() as { data?: { challengeId?: string; resendAvailableAt?: string }; message: string; status: boolean };
			if (!response.ok || !body.status || !body.data?.challengeId) throw new Error(body.message);
			const nextResendAt = body.data.resendAvailableAt ? Date.parse(body.data.resendAvailableAt) : 0;
			setResendAvailableAt(Number.isFinite(nextResendAt) ? nextResendAt : 0);
			if (body.data.resendAvailableAt) sessionStorage.setItem('pendingOtpResendAvailableAt', body.data.resendAvailableAt);
			form.reset({ otp: '' });
			toast.success(body.message);
			if (body.data.challengeId !== challengeId) navigate(`/login/verify/${body.data.challengeId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`, { replace: true });
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to resend OTP.'); }
		finally { setResending(false); }
	}
	return (
		<main className="flex min-h-screen items-center justify-center bg-app-canvas px-5 py-12 text-app-text">
			<section className="w-full max-w-md rounded-[2rem] border border-stone-200 bg-app-surface p-6 shadow-[0_24px_80px_-40px_rgba(43,87,72,.45)] dark:border-stone-700 sm:p-9">
				<Link
					className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-brand-primary dark:text-stone-300"
					onClick={clearPendingOtp}
					to="/login"
				>
					<ArrowLeft className="size-4" />
					Back
				</Link>
				<p className="mt-8 text-sm font-semibold text-brand-primary dark:text-brand-action">
					Check WhatsApp
				</p>
				<h1 className="mt-2 text-3xl font-semibold tracking-[-.03em]">
					Enter your verification code
				</h1>
				<p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
					We sent a six-digit code to <span className="font-semibold text-app-text">{pendingMobile}</span>.{' '}
					<Link className="font-semibold text-brand-primary hover:underline dark:text-brand-action" to={`/login?changeNumber=1${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`}>Change number</Link>
				</p>
				<form className="mt-8 space-y-5" onSubmit={form.handleSubmit(verify)}>
					<Controller
						control={form.control}
						name="otp"
						render={({ field, fieldState }) => (
							<label className="block">
								<span className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-stretch gap-3">
									<input
										{...field}
										autoComplete="one-time-code"
										autoFocus
										className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-4 text-center font-mono text-3xl tracking-[.35em] text-stone-950 outline-none focus:border-brand-action dark:border-stone-700 dark:bg-app-canvas dark:text-white"
										inputMode="numeric"
										maxLength={6}
										placeholder="000000"
									/>
									<button
										aria-label={remainingSeconds > 0 ? `Resend available in ${remainingSeconds} seconds` : 'Resend OTP'}
										className="grid aspect-square h-full min-h-[4.5rem] place-items-center rounded-2xl border border-stone-300 bg-stone-50 text-brand-primary transition hover:border-brand-action hover:bg-brand-action/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-app-canvas dark:text-brand-action"
										disabled={resending || remainingSeconds > 0}
										onClick={() => void resendOtp()}
										title={remainingSeconds > 0 ? `Resend in ${remainingSeconds}s` : 'Resend OTP'}
										type="button"
									>
										{resending ? <RotateCw className="size-5 animate-spin" /> : remainingSeconds > 0 ? <span className="text-xs font-bold tabular-nums">{remainingSeconds}s</span> : <RotateCw className="size-5" />}
									</button>
								</span>
								{fieldState.error && (
									<span className="mt-1.5 block text-center text-xs text-rose-600">
										{fieldState.error.message}
									</span>
								)}
							</label>
						)}
					/>
					<button
						className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-action px-4 py-3.5 font-semibold text-brand-ink"
						disabled={form.formState.isSubmitting}
						type="submit"
					>
						{form.formState.isSubmitting ? 'Verifying…' : 'Verify and continue'}
						<ArrowRight className="size-4" />
					</button>
				</form>
			</section>
		</main>
	);
}
