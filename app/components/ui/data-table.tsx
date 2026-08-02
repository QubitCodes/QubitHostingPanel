import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import type { ReactNode } from 'react';

interface DataTableProps {
	children: ReactNode;
	minimumWidth?: string;
}

interface DataTableToolbarProps {
	children?: ReactNode;
	onSearchChange: (value: string) => void;
	resultLabel?: string;
	searchPlaceholder?: string;
	searchValue: string;
}

interface SortableTableHeaderProps {
	activeDirection?: 'asc' | 'desc';
	children: ReactNode;
	className?: string;
	onSort: () => void;
}

/** Shared responsive table viewport with a semantic application surface. */
export function DataTable({
	children,
	minimumWidth = '56rem',
}: DataTableProps) {
	return (
		<div className="overflow-x-auto rounded-2xl border border-stone-200 bg-app-surface dark:border-stone-800">
			<table className="w-full text-sm" style={{ minWidth: minimumWidth }}>
				{children}
			</table>
		</div>
	);
}

/** Search and module-filter row shared by data-heavy pages. */
export function DataTableToolbar({
	children,
	onSearchChange,
	resultLabel,
	searchPlaceholder = 'Search records',
	searchValue,
}: DataTableToolbarProps) {
	return (
		<div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
			<label className="relative min-w-0 flex-1 lg:max-w-md">
				<span className="sr-only">{searchPlaceholder}</span>
				<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
				<input
					className="w-full rounded-xl border border-stone-300 bg-app-surface py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-brand-action focus:ring-2 focus:ring-brand-action/15 dark:border-stone-700"
					onChange={(event) => onSearchChange(event.target.value)}
					placeholder={searchPlaceholder}
					type="search"
					value={searchValue}
				/>
			</label>
			<div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
			{resultLabel && (
				<p className="shrink-0 text-xs font-medium text-app-muted">{resultLabel}</p>
			)}
		</div>
	);
}

/** Sticky right-side heading for icon-only row actions. */
export function StickyActionsHeader({ label = 'Actions' }: { label?: string }) {
	return (
		<th className="sticky right-0 z-20 bg-app-canvas px-5 py-3 text-right shadow-[-10px_0_18px_-16px_rgba(0,0,0,.55)]">
			{label}
		</th>
	);
}

/** Sticky right-side cell which remains visible while columns scroll. */
export function StickyActionsCell({ children }: { children: ReactNode }) {
	return (
		<td className="sticky right-0 z-10 bg-app-surface px-5 py-4 text-right shadow-[-10px_0_18px_-16px_rgba(0,0,0,.55)]">
			<div className="flex items-center justify-end gap-1">{children}</div>
		</td>
	);
}

/** Optional sortable header control for modules that expose sorting. */
export function SortableTableHeader({
	activeDirection,
	children,
	className = '',
	onSort,
}: SortableTableHeaderProps) {
	const Icon = activeDirection === 'asc' ? ArrowUp : activeDirection === 'desc' ? ArrowDown : ArrowUpDown;
	return (
		<th className={`px-5 py-3 ${className}`}>
			<button
				className="inline-flex items-center gap-1.5 font-semibold hover:text-brand-primary dark:hover:text-brand-action"
				onClick={onSort}
				type="button"
			>
				{children}
				<Icon className="size-3.5" />
			</button>
		</th>
	);
}
