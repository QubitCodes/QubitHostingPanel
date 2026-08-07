import {
	ArrowLeft,
	Check,
	ChevronRight,
	Folder,
	Home,
	Search,
} from 'lucide-react';
import { useMemo, useState } from 'react';

interface RepositoryDirectoryBrowserProps {
	directories: string[];
	initialDirectory?: string;
	onSelect: (directory: string) => void;
}

/** Converts provider paths into one stable repository-relative representation. */
export function normalizeRepositoryDirectory(directory: string): string {
	const normalized = directory.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
	return normalized || '/';
}

/** Returns only the folders immediately inside the current repository directory. */
export function childRepositoryDirectories(
	directories: string[],
	currentDirectory: string,
): string[] {
	const current = normalizeRepositoryDirectory(currentDirectory);
	const prefix = current === '/' ? '' : `${current}/`;
	return [...new Set(directories.map(normalizeRepositoryDirectory))]
		.filter((directory) => {
			if (directory === '/' || directory === current || !directory.startsWith(prefix))
				return false;
			return !directory.slice(prefix.length).includes('/');
		})
		.sort((left, right) => left.localeCompare(right));
}

function parentDirectory(directory: string): string {
	const normalized = normalizeRepositoryDirectory(directory);
	if (normalized === '/' || !normalized.includes('/')) return '/';
	return normalized.slice(0, normalized.lastIndexOf('/')) || '/';
}

function directoryLabel(directory: string): string {
	const normalized = normalizeRepositoryDirectory(directory);
	return normalized === '/' ? 'Repository root' : normalized.split('/').at(-1)!;
}

/** Navigable folder picker shared by application create and edit drawers. */
export function RepositoryDirectoryBrowser({
	directories,
	initialDirectory = '/',
	onSelect,
}: RepositoryDirectoryBrowserProps) {
	const normalizedDirectories = useMemo(
		() => [...new Set(['/', ...directories.map(normalizeRepositoryDirectory)])],
		[directories],
	);
	const requestedInitial = normalizeRepositoryDirectory(initialDirectory);
	const [currentDirectory, setCurrentDirectory] = useState(
		normalizedDirectories.includes(requestedInitial) ? requestedInitial : '/',
	);
	const [search, setSearch] = useState('');
	const children = childRepositoryDirectories(
		normalizedDirectories,
		currentDirectory,
	);
	const searchResults = search.trim()
		? normalizedDirectories
				.filter(
					(directory) =>
						directory !== '/' &&
						directory.toLowerCase().includes(search.trim().toLowerCase()),
				)
				.slice(0, 100)
		: [];
	const breadcrumbs =
		currentDirectory === '/' ? [] : currentDirectory.split('/').filter(Boolean);

	return (
		<div className="mt-5 grid gap-4">
			<label className="relative">
				<span className="sr-only">Search repository folders</span>
				<Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
				<input
					autoFocus
					className="w-full rounded-xl border border-brand-primary/15 bg-white py-3 pl-11 pr-4 text-gray-900 outline-none transition focus:border-brand-action dark:bg-gray-800 dark:text-gray-100"
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search repository folders"
					value={search}
				/>
			</label>
			<div className="flex min-w-0 items-center gap-2 rounded-xl border border-brand-primary/10 bg-brand-primary/[0.03] p-2">
				<button
					aria-label="Go back"
					className="rounded-lg p-2 hover:bg-brand-primary/10 disabled:cursor-not-allowed disabled:opacity-35"
					disabled={currentDirectory === '/'}
					onClick={() => {
						setCurrentDirectory(parentDirectory(currentDirectory));
						setSearch('');
					}}
					type="button"
				>
					<ArrowLeft className="size-4" />
				</button>
				<nav aria-label="Current repository directory" className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
					<button
						className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 font-semibold hover:bg-brand-primary/10"
						onClick={() => {
							setCurrentDirectory('/');
							setSearch('');
						}}
						type="button"
					>
						<Home className="size-4" /> Root
					</button>
					{breadcrumbs.map((segment, index) => {
						const path = breadcrumbs.slice(0, index + 1).join('/');
						return (
							<span className="flex shrink-0 items-center gap-1" key={path}>
								<ChevronRight className="size-3 text-app-muted" />
								<button
									className="rounded-lg px-2 py-1.5 font-semibold hover:bg-brand-primary/10"
									onClick={() => {
										setCurrentDirectory(path);
										setSearch('');
									}}
									type="button"
								>
									{segment}
								</button>
							</span>
						);
					})}
				</nav>
			</div>
			<div className="max-h-[55vh] overflow-y-auto rounded-2xl border border-brand-primary/10 p-2">
				{(search.trim() ? searchResults : children).map((directory) => (
					<button
						className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-brand-primary/5"
						key={directory}
						onClick={() => {
							setCurrentDirectory(directory);
							setSearch('');
						}}
						type="button"
					>
						<span className="flex min-w-0 items-center gap-3">
							<Folder className="size-5 shrink-0 text-brand-action" />
							<span className="min-w-0">
								<span className="block truncate font-semibold">{directoryLabel(directory)}</span>
								{search.trim() && <span className="block truncate font-mono text-xs text-app-muted">{directory}</span>}
							</span>
						</span>
						<ChevronRight className="size-4 shrink-0 text-app-muted" />
					</button>
				))}
				{!(search.trim() ? searchResults : children).length && (
					<p className="p-6 text-center text-sm text-app-muted">
						{search.trim() ? 'No matching folders.' : 'This folder has no subfolders.'}
					</p>
				)}
			</div>
			<div className="flex flex-col gap-3 rounded-xl border border-brand-primary/10 p-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0">
					<p className="text-xs font-bold uppercase text-app-muted">Selected directory</p>
					<code className="block truncate text-sm">{currentDirectory}</code>
				</div>
				<button
					className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-action px-4 py-2.5 font-bold text-brand-ink"
					onClick={() => onSelect(currentDirectory)}
					type="button"
				>
					<Check className="size-4" /> Use This Folder
				</button>
			</div>
		</div>
	);
}
