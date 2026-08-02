import { Check, ChevronDown, Search } from 'lucide-react';
import {
	getCountries,
	getCountryCallingCode,
	parsePhoneNumberFromString,
	type CountryCode,
} from 'libphonenumber-js';
import { useEffect, useMemo, useRef, useState } from 'react';

interface CountryOption {
	callingCode: string;
	country: CountryCode;
	name: string;
}

interface PhoneNumberInputProps {
	allowDevelopmentBypass?: boolean;
	autoFocus?: boolean;
	countryCode?: string;
	error?: string;
	id: string;
	label?: string;
	mobile: string;
	onChange: (value: { countryCode?: string; mobile: string }) => void;
	placeholder?: string;
}

/** Keeps at most one transient leading development marker and removes every later tilde. */
export function sanitizeDevelopmentBypassMarker(value: string, allowed: boolean): { phoneValue: string; prefix: string } {
	const prefix = allowed ? value.startsWith('~~') ? '~~' : value.startsWith('~') ? '~' : '' : '';
	return { prefix, phoneValue: value.slice(prefix.length).replace(/~/g, '') };
}

/** Reusable E.164-aware mobile input with a searchable, theme-aware country picker. */
export function PhoneNumberInput({
	allowDevelopmentBypass = false,
	autoFocus,
	countryCode,
	error,
	id,
	label = 'Mobile number',
	mobile,
	onChange,
	placeholder = '7023456789',
}: PhoneNumberInputProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [selectedCountry, setSelectedCountry] = useState<CountryCode>();
	const countries = useMemo(() => {
		const names = new Intl.DisplayNames(['en'], { type: 'region' });
		return getCountries()
			.map((country) => ({
				country,
				name: names.of(country) ?? country,
				callingCode: `+${getCountryCallingCode(country)}`,
			}))
			.sort((left, right) => left.name.localeCompare(right.name));
	}, []);
	const activeCountry =
		countries.find(({ country }) => country === selectedCountry) ??
		countries.find(({ callingCode }) => callingCode === countryCode);
	const filteredCountries = countries.filter(({ callingCode, country, name }) =>
		`${country} ${callingCode} ${name}`
			.toLowerCase()
			.includes(query.trim().toLowerCase()),
	);

	useEffect(() => {
		if (!open) return;
		function closeOnOutsideClick(event: MouseEvent): void {
			if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
		}
		document.addEventListener('mousedown', closeOnOutsideClick);
		return () => document.removeEventListener('mousedown', closeOnOutsideClick);
	}, [open]);

	function normalizeMobile(value: string): void {
		const compact = value.replace(/[()\s.-]/g, '');
		const { phoneValue, prefix: bypassPrefix } = sanitizeDevelopmentBypassMarker(compact, allowDevelopmentBypass);
		if (phoneValue.startsWith('+')) {
			const parsed = parsePhoneNumberFromString(phoneValue);
			if (parsed) {
				setSelectedCountry(parsed.country);
				onChange({
					countryCode: `+${parsed.countryCallingCode}`,
					mobile: `${bypassPrefix}${parsed.nationalNumber}`,
				});
				return;
			}
			const callingCode = [
				...new Set(countries.map((country) => country.callingCode)),
			]
				.sort((left, right) => right.length - left.length)
				.find((code) => phoneValue.startsWith(code));
			if (callingCode) {
				onChange({
					countryCode: callingCode,
					mobile: `${bypassPrefix}${phoneValue.slice(callingCode.length).replace(/\D/g, '')}`,
				});
				return;
			}
		}
		onChange({ countryCode, mobile: `${bypassPrefix}${phoneValue.replace(/\D/g, '')}` });
	}

	function selectCountry(option: CountryOption): void {
		setSelectedCountry(option.country);
		onChange({ countryCode: option.callingCode, mobile });
		setOpen(false);
		setQuery('');
	}

	return (
		<div className="block text-sm font-medium">
			<label htmlFor={id}>{label}</label>
			<div
				className={`relative mt-2 grid rounded-2xl border bg-app-surface transition focus-within:border-brand-action focus-within:ring-2 focus-within:ring-brand-action/15 ${error ? 'border-rose-500' : 'border-stone-300 dark:border-stone-700'} ${countryCode ? 'grid-cols-[auto_1fr]' : 'grid-cols-1'}`}
				ref={containerRef}
			>
				{countryCode && (
					<div className="relative">
						<button
							aria-expanded={open}
							aria-haspopup="listbox"
							aria-label="Choose country code"
							className="flex h-full items-center gap-1 rounded-l-2xl border-r border-stone-200 bg-stone-50 px-1.5 text-sm font-semibold text-stone-900 outline-none hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
							onClick={() => setOpen((value) => !value)}
							type="button"
						>
							<span>{activeCountry?.country ?? '—'}</span>
							<span>{countryCode}</span>
							<ChevronDown className="size-4 text-stone-500" />
						</button>
						{open && (
							<div className="absolute left-0 top-[calc(100%+.5rem)] z-50 w-72 overflow-hidden rounded-2xl border border-stone-200 bg-app-surface shadow-2xl shadow-stone-950/15 dark:border-stone-700">
								<div className="relative border-b border-stone-200 p-2 dark:border-stone-700">
									<Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
									<input
										autoFocus
										className="w-full rounded-xl bg-stone-100 py-2.5 pl-9 pr-3 text-sm text-stone-950 outline-none placeholder:text-stone-500 dark:bg-stone-900 dark:text-stone-100"
										onChange={(event) => setQuery(event.target.value)}
										onKeyDown={(event) => {
											if (event.key === 'Escape') setOpen(false);
											if (event.key === 'Enter' && filteredCountries[0]) {
												event.preventDefault();
												selectCountry(filteredCountries[0]);
											}
										}}
										placeholder="Search country or code"
										value={query}
									/>
								</div>
								<div className="max-h-64 overflow-y-auto p-1" role="listbox">
									{filteredCountries.map((option) => (
										<button
											aria-selected={option.country === activeCountry?.country}
											className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-stone-800 hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-800"
											key={option.country}
											onClick={() => selectCountry(option)}
											role="option"
											type="button"
										>
											<span className="w-7 font-semibold">
												{option.country}
											</span>
											<span className="w-12 text-stone-500 dark:text-stone-400">
												{option.callingCode}
											</span>
											<span className="min-w-0 flex-1 truncate">
												{option.name}
											</span>
											{option.country === activeCountry?.country && (
												<Check className="size-4 text-brand-primary dark:text-brand-action" />
											)}
										</button>
									))}
									{filteredCountries.length === 0 && (
										<p className="px-3 py-6 text-center text-sm text-stone-500">
											No countries found.
										</p>
									)}
								</div>
							</div>
						)}
					</div>
				)}
				<input
					autoComplete="tel"
					autoFocus={autoFocus}
					className="min-w-0 rounded-r-2xl bg-transparent px-4 py-3.5 text-stone-950 outline-none placeholder:text-stone-400 dark:text-stone-100"
					id={id}
					inputMode="tel"
					onChange={(event) => normalizeMobile(event.target.value)}
					placeholder={placeholder}
					value={mobile}
				/>
			</div>
			{error && (
				<span className="mt-1.5 block text-xs text-rose-600">{error}</span>
			)}
		</div>
	);
}
