import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, MessageCircle, ShieldCheck } from 'lucide-react';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';

import { requestOtpSchema } from '@schemas/auth';

type LoginForm = z.infer<typeof requestOtpSchema>;

/** Passwordless WhatsApp entry screen with optional international-number parsing. */
export default function LoginPage() {
	const navigate = useNavigate();
	const form = useForm<LoginForm>({ resolver: zodResolver(requestOtpSchema), defaultValues: { countryCode: undefined, mobile: '' } });
	const countries = useMemo(() => {
		const names = new Intl.DisplayNames(['en'], { type: 'region' });
		return getCountries().map((country) => ({ country, name: names.of(country) ?? country, callingCode: `+${getCountryCallingCode(country)}` })).sort((left, right) => left.name.localeCompare(right.name));
	}, []);
	const selectedCountryCode = useWatch({ control: form.control, name: 'countryCode' });

	function normalizeMobile(value: string): void {
		const compact = value.replace(/[()\s.-]/g, '');
		if (compact.startsWith('+')) {
			const parsed = parsePhoneNumberFromString(compact);
			if (parsed) {
				form.setValue('countryCode', `+${parsed.countryCallingCode}`, { shouldValidate: true });
				form.setValue('mobile', parsed.nationalNumber, { shouldValidate: true });
				return;
			}
			const callingCode = [...new Set(countries.map((country) => country.callingCode))].sort((left, right) => right.length - left.length).find((code) => compact.startsWith(code));
			if (callingCode) {
				form.setValue('countryCode', callingCode, { shouldValidate: true });
				form.setValue('mobile', compact.slice(callingCode.length).replace(/\D/g, ''), { shouldValidate: form.formState.isSubmitted });
				return;
			}
		}
		form.setValue('mobile', compact.replace(/\D/g, ''), { shouldValidate: form.formState.isSubmitted });
	}

	async function requestOtp(values: LoginForm): Promise<void> {
		try {
			const response = await fetch('/api/v1/auth/otp/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values) });
			const body = await response.json() as { data?: { challengeId?: string }; message: string; status: boolean };
			if (!response.ok || !body.status || !body.data?.challengeId) throw new Error(body.message);
			sessionStorage.setItem('pendingMobile', `${values.countryCode ?? ''}${values.mobile}`);
			navigate(`/login/verify/${body.data.challengeId}`);
		} catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to request OTP.'); }
	}

	return <main className="grid min-h-screen bg-[#f4f2ec] text-stone-950 dark:bg-[#111513] dark:text-stone-50 lg:grid-cols-[1.05fr_.95fr]">
		<section className="hidden overflow-hidden bg-[#123c32] p-12 text-[#effbf5] lg:flex lg:flex-col lg:justify-between"><div className="flex items-center gap-3 font-semibold"><span className="grid size-10 place-items-center rounded-2xl bg-[#e0ff71] text-[#123c32]">Q</span>Qubit Hosting</div><div className="max-w-xl"><p className="text-sm font-semibold uppercase tracking-[.24em] text-[#e0ff71]">One secure identity</p><h1 className="mt-5 text-6xl font-semibold leading-[1.02] tracking-[-.045em]">Your hosting operation, without another password.</h1><p className="mt-6 max-w-lg text-lg leading-8 text-emerald-100/80">Authenticate through your verified WhatsApp number, then move between personal, company, and platform contexts safely.</p></div><div className="flex gap-6 text-sm text-emerald-100/75"><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-[#e0ff71]" />Short-lived access</span><span className="flex items-center gap-2"><MessageCircle className="size-4 text-[#e0ff71]" />WhatsApp OTP</span></div></section>
		<section className="flex items-center justify-center px-5 py-12 sm:px-10"><div className="w-full max-w-md"><div className="lg:hidden"><span className="grid size-11 place-items-center rounded-2xl bg-[#123c32] font-semibold text-[#e0ff71]">Q</span></div><p className="mt-10 text-sm font-semibold text-teal-700 dark:text-[#e0ff71]">Welcome back</p><h2 className="mt-2 text-4xl font-semibold tracking-[-.035em]">Sign in to your panel</h2><p className="mt-3 text-sm leading-6 text-stone-600 dark:text-stone-300">Enter the mobile number registered with your account. Include a country code when needed.</p><form className="mt-8 space-y-5" onSubmit={form.handleSubmit(requestOtp)}><Controller control={form.control} name="mobile" render={({ field, fieldState }) => <label className="block text-sm font-medium">Mobile number<div className={`mt-2 grid overflow-hidden rounded-2xl border border-stone-300 bg-white focus-within:border-teal-700 dark:border-stone-700 dark:bg-[#1b211e] ${selectedCountryCode ? 'grid-cols-[9rem_1fr]' : 'grid-cols-1'}`}>{selectedCountryCode && <select aria-label="Country code" className="min-w-0 border-r border-stone-200 bg-stone-50 px-3 py-3.5 text-sm text-stone-950 outline-none dark:border-stone-700 dark:bg-stone-900 dark:text-white" onChange={(event) => form.setValue('countryCode', event.target.value, { shouldValidate: true })} value={selectedCountryCode}>{countries.map(({ callingCode, country, name }) => <option key={country} value={callingCode}>{country} {callingCode} · {name}</option>)}</select>}<input {...field} autoComplete="tel" autoFocus className="min-w-0 bg-transparent px-4 py-3.5 text-stone-950 outline-none dark:text-white" inputMode="tel" onChange={(event) => normalizeMobile(event.target.value)} placeholder="+91 9400143527" /></div>{fieldState.error && <span className="mt-1.5 block text-xs text-rose-600">{fieldState.error.message}</span>}</label>} /><button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#123c32] px-4 py-3.5 font-semibold text-white hover:bg-[#174d40] disabled:opacity-50 dark:bg-[#e0ff71] dark:text-[#123c32]" disabled={form.formState.isSubmitting} type="submit">{form.formState.isSubmitting ? 'Sending code…' : 'Continue with WhatsApp'}<ArrowRight className="size-4" /></button></form><p className="mt-6 text-center text-xs leading-5 text-stone-500">No passwords. No recovery questions. Access is tied to verified identities and revocable device sessions.</p></div></section>
	</main>;
}
