import { Check, ChevronDown, LoaderCircle, Plus, Search } from 'lucide-react';
import {
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from 'react';

export interface SearchableSelectOption {
	disabled?: boolean;
	keywords?: string;
	label: string;
	value: string;
}

interface SearchableSelectProps<TOption extends SearchableSelectOption> {
	allowCreate?: boolean;
	ariaLabel?: string;
	className?: string;
	disabled?: boolean;
	emptyMessage?: string;
	onChange: (value: string, option: TOption) => void;
	onCreate?: (label: string) => Promise<TOption> | TOption;
	options: TOption[];
	placeholder?: string;
	renderOption?: (option: TOption, selected: boolean) => ReactNode;
	renderValue?: (option: TOption) => ReactNode;
	searchable?: boolean;
	searchPlaceholder?: string;
	value: string;
}

/** Theme-aware searchable select with optional permission-controlled inline creation. */
export function SearchableSelect<TOption extends SearchableSelectOption>({
	allowCreate = false,
	ariaLabel = 'Choose an option',
	className = '',
	disabled = false,
	emptyMessage = 'No options found.',
	onChange,
	onCreate,
	options,
	placeholder = 'Select an option',
	renderOption,
	renderValue,
	searchable = true,
	searchPlaceholder = 'Search options',
	value,
}: SearchableSelectProps<TOption>) {
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listboxId = useId();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [creating, setCreating] = useState(false);
	const [createError, setCreateError] = useState('');
	const [activeIndex, setActiveIndex] = useState(0);
	const selectedOption = options.find((option) => option.value === value);
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const filteredOptions = useMemo(
		() =>
			options.filter((option) =>
				`${option.label} ${option.keywords ?? ''}`
					.toLocaleLowerCase()
					.includes(normalizedQuery),
			),
		[normalizedQuery, options],
	);
	const canCreate =
		searchable &&
		allowCreate &&
		Boolean(onCreate) &&
		Boolean(query.trim()) &&
		!options.some(
			(option) => option.label.toLocaleLowerCase() === normalizedQuery,
		);

	useEffect(() => {
		if (!open) return;
		function closeOnOutsideInteraction(event: MouseEvent | FocusEvent): void {
			if (!containerRef.current?.contains(event.target as Node)) {
				setOpen(false);
				setQuery('');
			}
		}
		document.addEventListener('mousedown', closeOnOutsideInteraction);
		document.addEventListener('focusin', closeOnOutsideInteraction);
		return () => {
			document.removeEventListener('mousedown', closeOnOutsideInteraction);
			document.removeEventListener('focusin', closeOnOutsideInteraction);
		};
	}, [open]);

	function choose(option: TOption): void {
		if (option.disabled) return;
		onChange(option.value, option);
		setOpen(false);
		setQuery('');
	}

	async function createOption(): Promise<void> {
		if (!canCreate || !onCreate) return;
		setCreating(true);
		setCreateError('');
		try {
			choose(await onCreate(query.trim()));
		} catch (error) {
			setCreateError(
				error instanceof Error ? error.message : 'Unable to add this option.',
			);
		} finally {
			setCreating(false);
		}
	}

	return (
		<div
			className={`relative ${className}`}
			onKeyDown={(event) => {
				if (event.key !== 'Escape' || !open) return;
				event.preventDefault();
				event.stopPropagation();
				setOpen(false);
				setQuery('');
				setCreateError('');
				triggerRef.current?.focus();
			}}
			ref={containerRef}
		>
			<button
				aria-controls={listboxId}
				aria-expanded={open}
				aria-haspopup="listbox"
				aria-label={ariaLabel}
				className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-stone-300 bg-app-surface px-3 py-2.5 text-left text-sm outline-none transition hover:border-brand-muted focus:border-brand-action focus:ring-2 focus:ring-brand-action/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700"
				disabled={disabled}
				onClick={() => setOpen((current) => !current)}
				onKeyDown={(event) => {
					if (!open || searchable) return;
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						setActiveIndex((index) =>
							Math.min(index + 1, filteredOptions.length - 1),
						);
					}
					if (event.key === 'ArrowUp') {
						event.preventDefault();
						setActiveIndex((index) => Math.max(index - 1, 0));
					}
					if (event.key === 'Enter' && filteredOptions[activeIndex]) {
						event.preventDefault();
						choose(filteredOptions[activeIndex]);
					}
				}}
				ref={triggerRef}
				type="button"
			>
				<span className={`min-w-0 flex-1 truncate ${selectedOption ? '' : 'text-app-muted'}`}>
					{selectedOption
						? renderValue?.(selectedOption) ?? selectedOption.label
						: placeholder}
				</span>
				<ChevronDown className={`size-4 shrink-0 text-app-muted transition ${open ? 'rotate-180' : ''}`} />
			</button>
			{open && (
				<div className="absolute left-0 top-[calc(100%+.5rem)] z-50 min-w-full overflow-hidden rounded-2xl border border-stone-200 bg-app-surface shadow-2xl shadow-stone-950/15 dark:border-stone-700">
					{searchable && (
						<div className="relative border-b border-stone-200 p-2 dark:border-stone-700">
							<Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
							<input
							autoFocus
							className="w-full rounded-xl bg-stone-100 py-2.5 pl-9 pr-3 text-sm text-stone-950 outline-none placeholder:text-app-muted dark:bg-stone-900 dark:text-stone-100"
							onChange={(event) => {
								setQuery(event.target.value);
								setActiveIndex(0);
							}}
							onKeyDown={(event) => {
								if (event.key === 'ArrowDown') {
									event.preventDefault();
									setActiveIndex((index) =>
										Math.min(index + 1, filteredOptions.length - 1),
									);
								}
								if (event.key === 'ArrowUp') {
									event.preventDefault();
									setActiveIndex((index) => Math.max(index - 1, 0));
								}
								if (event.key === 'Enter') {
									event.preventDefault();
									if (filteredOptions[activeIndex]) choose(filteredOptions[activeIndex]);
									else if (canCreate) void createOption();
								}
							}}
							placeholder={searchPlaceholder}
							type="search"
							value={query}
							/>
						</div>
					)}
					<div className="max-h-64 overflow-y-auto p-1" id={listboxId} role="listbox">
						{filteredOptions.map((option, index) => {
							const selected = option.value === value;
							return (
								<button
									aria-selected={selected}
									className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-stone-800 ${activeIndex === index ? 'bg-stone-100 dark:bg-stone-800' : ''}`}
									disabled={option.disabled}
									key={option.value}
									onClick={() => choose(option)}
									role="option"
									type="button"
								>
									<span className="min-w-0 flex-1 truncate">
										{renderOption?.(option, selected) ?? option.label}
									</span>
									{selected && <Check className="size-4 shrink-0 text-brand-action" />}
								</button>
							);
						})}
						{canCreate && (
							<button
								className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-brand-primary hover:bg-brand-muted/15 disabled:opacity-60 dark:text-brand-action"
								disabled={creating}
								onClick={() => void createOption()}
								type="button"
							>
								{creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
								Add “{query.trim()}”
							</button>
						)}
						{filteredOptions.length === 0 && !canCreate && (
							<p className="px-3 py-6 text-center text-sm text-app-muted">{emptyMessage}</p>
						)}
						{createError && (
							<p className="px-3 py-2 text-xs text-rose-600" role="alert">{createError}</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
