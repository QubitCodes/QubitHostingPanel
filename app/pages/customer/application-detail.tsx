import { Globe2 } from 'lucide-react';
import { Link, useParams } from 'react-router';

import CustomerApplicationsPage from '@root/app/pages/customer/applications';

export default function ApplicationDetailPage() {
	const { applicationId } = useParams();
	return <><div className="mx-auto mb-4 flex max-w-4xl justify-end"><Link className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/15 px-4 py-2 text-sm font-bold" to={`/dashboard/applications/${applicationId}/domains`}><Globe2 className="size-4" /> Manage domains</Link></div><CustomerApplicationsPage /></>;
}
