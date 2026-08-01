import { ServerCog } from 'lucide-react';

/** Minimal foundation screen; product dashboards arrive in later implementation phases. */
export default function HomePage() {
	return (
		<main className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6">
			<section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-10">
				<div className="mb-6 inline-flex rounded-2xl bg-indigo-50 p-3 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
					<ServerCog aria-hidden="true" className="size-7" />
				</div>
				<p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-700 dark:text-indigo-300">
					Foundation active
				</p>
				<h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
					Qubit Hosting Panel
				</h1>
				<p className="mt-5 max-w-xl text-base leading-7 text-slate-600 dark:text-slate-300">
					The standalone control plane for hosting packages, subscriptions, entitlements, organisations, and customer resources.
				</p>
			</section>
		</main>
	);
}
