import { Link, href } from 'react-router';

/** Browser-facing fallback for routes outside the JSON API subtree. */
export default function NotFoundPage() {
	return (
		<main className="flex min-h-screen items-center justify-center px-4">
			<section className="text-center">
				<p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">404</p>
				<h1 className="mt-2 text-3xl font-bold">Page not found</h1>
				<Link className="mt-6 inline-flex text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300" to={href('/')}>
					Return home
				</Link>
			</section>
		</main>
	);
}
