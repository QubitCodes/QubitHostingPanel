import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, MessageCircle, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';

import { PhoneNumberInput } from '@root/app/components/forms/phone-number-input';
import { getDeviceIdentifier } from '@root/app/utils/authenticatedFetch';
import { safeAuthenticationReturn } from '@root/app/utils/authReturn';
import { openPanelPath } from '@root/app/utils/panelNavigation';
import { requestOtpSchema } from '@schemas/auth';

type LoginForm = z.infer<typeof requestOtpSchema>;

/** Passwordless WhatsApp entry screen with reusable international phone input. */
export default function LoginPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const returnTo = safeAuthenticationReturn(searchParams.get('returnTo'));
	const form = useForm<LoginForm>({
		resolver: zodResolver(requestOtpSchema),
		defaultValues: { countryCode: undefined, mobile: '' },
	});
	const countryCode = useWatch({ control: form.control, name: 'countryCode' });
	const mobile = useWatch({ control: form.control, name: 'mobile' });
	useEffect(() => {
		if (searchParams.get('changeNumber') !== '1') return;
		try {
			const storedIdentity = sessionStorage.getItem('pendingOtpIdentity');
			if (storedIdentity) form.reset(JSON.parse(storedIdentity) as LoginForm);
		} catch { sessionStorage.removeItem('pendingOtpIdentity'); }
	}, [form, searchParams]);

	useEffect(() => {
		const nationalNumber = mobile.replace(/^~~/, '').replace(/\D/g, '');
		if (countryCode || nationalNumber.length < 8) return;
		const controller = new AbortController();
		const timeout = window.setTimeout(async () => {
			try {
				const response = await fetch('/api/v1/auth/mobile-country', {
					body: JSON.stringify({ mobile: nationalNumber }),
					headers: { 'content-type': 'application/json' },
					method: 'POST',
					signal: controller.signal,
				});
				const body = await response.json() as { data?: { countryCodeRequired?: boolean; suggestedCountryCode?: string }; status: boolean };
				if (response.ok && body.status && body.data?.countryCodeRequired && body.data.suggestedCountryCode) {
					form.setValue('countryCode', body.data.suggestedCountryCode, { shouldValidate: true });
				}
			} catch (error) {
				if (!(error instanceof DOMException && error.name === 'AbortError')) console.warn('Unable to resolve mobile country.');
			}
		}, 350);
		return () => { window.clearTimeout(timeout); controller.abort(); };
	}, [countryCode, form, mobile]);

	async function requestOtp(values: LoginForm): Promise<void> {
		try {
			const response = await fetch('/api/v1/auth/otp/request', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-device-id': getDeviceIdentifier() },
				body: JSON.stringify(values),
			});
			const body = (await response.json()) as {
				data?: { challengeId?: string; resendAvailableAt?: string; user?: { displayName?: string; hasAdminAccess?: boolean; hasCustomerDashboardAccess?: boolean; id: string } };
				message: string;
				misc?: { accessToken?: string; refreshToken?: string };
				status: boolean;
			};
			if (!response.ok || !body.status)
				throw new Error(body.message);
			if (body.misc?.accessToken && body.misc.refreshToken) {
				sessionStorage.setItem('accessToken', body.misc.accessToken);
				sessionStorage.setItem('refreshToken', body.misc.refreshToken);
				sessionStorage.setItem('authUser', JSON.stringify(body.data?.user ?? {}));
				const user = body.data?.user;
				if (returnTo) navigate(returnTo);
				else if (user?.hasCustomerDashboardAccess) await openPanelPath('/dashboard');
				else if (user?.hasAdminAccess) await openPanelPath('/admin/overview');
				else navigate('/');
				return;
			}
			if (!body.data?.challengeId) throw new Error(body.message);
			sessionStorage.setItem(
				'pendingMobile',
				`${values.countryCode ?? ''}${values.mobile}`,
			);
			sessionStorage.setItem('pendingOtpIdentity', JSON.stringify({ countryCode: values.countryCode, mobile: values.mobile }));
			if (body.data.resendAvailableAt) sessionStorage.setItem('pendingOtpResendAvailableAt', body.data.resendAvailableAt);
			navigate(`/login/verify/${body.data.challengeId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Unable to request OTP.',
			);
		}
	}

	return (
		<main className="grid min-h-screen bg-app-canvas text-app-text lg:grid-cols-[1.05fr_.95fr]">
			<section className="hidden overflow-hidden bg-brand-primary p-12 text-white lg:flex lg:flex-col lg:justify-between">
				<div className="flex items-center gap-3 font-semibold">
					<span className="grid size-10 place-items-center rounded-2xl bg-brand-action text-brand-ink">
						Q
					</span>
					Ghost Deploy
				</div>
				<div className="max-w-xl">
					<p className="text-sm font-semibold uppercase tracking-[.24em] text-brand-action">
						One secure identity
					</p>
					<h1 className="mt-5 text-6xl font-semibold leading-[1.02] tracking-[-.045em]">
						Your hosting operation, without another password.
					</h1>
					<p className="mt-6 max-w-lg text-lg leading-8 text-white/80">
						Authenticate through your verified WhatsApp number, then move
						between personal, company, and platform contexts safely.
					</p>
				</div>
				<div className="flex gap-6 text-sm text-white/75">
					<span className="flex items-center gap-2">
						<ShieldCheck className="size-4 text-brand-action" />
						Short-lived access
					</span>
					<span className="flex items-center gap-2">
						<MessageCircle className="size-4 text-brand-action" />
						WhatsApp OTP
					</span>
				</div>
			</section>
			<section className="flex items-center justify-center px-5 py-12 sm:px-10">
				<div className="w-full max-w-md">
					<div className="lg:hidden">
						<span className="grid size-11 place-items-center rounded-2xl bg-brand-primary font-semibold text-brand-action">
							Q
						</span>
					</div>
					<p className="mt-10 text-sm font-semibold text-brand-primary dark:text-brand-action">
						Welcome back
					</p>
					<h2 className="mt-2 text-4xl font-semibold tracking-[-.035em]">
						Sign in to your panel
					</h2>
					<p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">
						Enter the mobile number registered with your account. Include a
						country code when needed.
					</p>
					<form
						className="mt-8 space-y-5"
						onSubmit={form.handleSubmit(requestOtp)}
					>
						<Controller
							control={form.control}
							name="mobile"
							render={({ field, fieldState }) => (
								<PhoneNumberInput
									allowDevelopmentBypass
									autoFocus
									countryCode={countryCode}
									error={fieldState.error?.message}
									id="login-mobile"
									mobile={field.value}
									onChange={(value) => {
										form.setValue('countryCode', value.countryCode, {
											shouldValidate: true,
										});
										field.onChange(value.mobile);
									}}
								/>
							)}
						/>
						<button
							className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-action px-4 py-3.5 font-semibold text-brand-ink transition hover:brightness-105 disabled:opacity-50"
							disabled={form.formState.isSubmitting}
							type="submit"
						>
							{form.formState.isSubmitting
								? 'Sending code…'
								: 'Continue with WhatsApp'}
							<ArrowRight className="size-4" />
						</button>
					</form>
					<p className="mt-6 text-center text-xs leading-5 text-stone-500">
						No passwords. No recovery questions. Access is tied to verified
						identities and revocable device sessions.
					</p>
				</div>
			</section>
		</main>
	);
}
