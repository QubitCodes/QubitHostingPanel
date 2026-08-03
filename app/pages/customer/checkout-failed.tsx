import { CircleAlert } from 'lucide-react';
import { Link, useParams } from 'react-router';

export default function CheckoutFailedPage() { const { checkoutId } = useParams(); return <main className="grid min-h-screen place-items-center bg-app-canvas p-5 text-app-text"><section className="max-w-lg rounded-[2rem] border border-rose-500/20 bg-app-surface p-8 text-center"><CircleAlert className="mx-auto size-10 text-rose-500" /><h1 className="mt-5 text-3xl font-black">Payment not completed</h1><p className="mt-3 text-app-muted">No workspace or hosting resource was created. You can safely retry this checkout.</p><Link className="mt-7 inline-flex rounded-xl bg-brand-action px-5 py-3 font-bold text-brand-ink" to={`/checkout/${checkoutId}/payment`}>Retry payment</Link></section></main>; }
