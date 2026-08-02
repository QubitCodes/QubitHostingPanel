import { LoaderCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

/** Routes the application root to the correct authentication entry point. */
export default function HomePage() {
	const navigate = useNavigate();

	useEffect(() => {
		const destination = sessionStorage.getItem('accessToken') ? '/admin/overview' : '/login';
		navigate(destination, { replace: true });
	}, [navigate]);

	return <main className="grid min-h-screen place-items-center bg-app-canvas text-brand-primary dark:text-brand-action"><div className="text-center"><LoaderCircle className="mx-auto size-7 animate-spin" /><p className="mt-3 text-sm font-medium">Opening Qubit Hosting…</p></div></main>;
}
