export type ManagedSystemPageKind =
	| 'application_error'
	| 'coming_soon'
	| 'maintenance'
	| 'request_rejected'
	| 'suspended';

interface ManagedSystemPageInput {
	detail?: string;
	hostname: string;
	kind: ManagedSystemPageKind;
}

const PAGE_COPY: Record<
	ManagedSystemPageKind,
	{ eyebrow: string; message: string; title: string }
> = {
	application_error: {
		eyebrow: 'Application error',
		message: 'The application could not complete this request. Please try again shortly.',
		title: 'Something went wrong',
	},
	coming_soon: {
		eyebrow: 'Launching soon',
		message: 'This application is being prepared. Please check back shortly.',
		title: 'Something good is on the way',
	},
	maintenance: {
		eyebrow: 'Scheduled maintenance',
		message: 'This application is temporarily unavailable while work is completed.',
		title: 'We will be right back',
	},
	request_rejected: {
		eyebrow: 'Request blocked',
		message: 'This request does not match the application upload policy.',
		title: 'The request could not be accepted',
	},
	suspended: {
		eyebrow: 'Service unavailable',
		message: 'This application is currently unavailable. Contact the application owner for assistance.',
		title: 'Application unavailable',
	},
};

/** Escapes customer-controlled hostname/detail values before rendering HTML. */
function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

/** Renders the standard, non-customizable MVA system page. */
export function managedSystemPage(input: ManagedSystemPageInput): string {
	const copy = PAGE_COPY[input.kind];
	const detail = input.detail?.trim() || copy.message;
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<meta name="robots" content="noindex,nofollow">
	<title>${escapeHtml(copy.title)}</title>
	<style>
		:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f7f4;color:#15231d}
		*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#dff4ee 0,transparent 48%),#f5f7f4}
		main{width:min(620px,100%);border:1px solid rgba(21,35,29,.12);border-radius:28px;background:rgba(255,255,255,.88);padding:clamp(28px,6vw,56px);box-shadow:0 24px 80px rgba(21,35,29,.12);backdrop-filter:blur(16px)}
		mark{display:inline-flex;border-radius:999px;background:#d7f4ec;color:#174c3f;padding:7px 12px;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
		h1{margin:24px 0 14px;font-size:clamp(34px,7vw,58px);line-height:1.02;letter-spacing:-.04em}p{margin:0;color:#5c6b65;font-size:17px;line-height:1.7}.host{margin-top:30px;font-size:13px;font-weight:700;color:#174c3f}.brand{margin-top:12px;font-size:12px;color:#83918c}
		@media(prefers-color-scheme:dark){:root{background:#0d1713;color:#f2f8f5}body{background:radial-gradient(circle at top,#193c31 0,transparent 48%),#0d1713}main{background:rgba(17,31,26,.9);border-color:rgba(215,244,236,.13)}p{color:#aab9b3}.host{color:#75cfb6}.brand{color:#7f918a}mark{background:#183c31;color:#9ce2ce}}
	</style>
</head>
<body><main><mark>${escapeHtml(copy.eyebrow)}</mark><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(detail)}</p><p class="host">${escapeHtml(input.hostname)}</p><p class="brand">Managed by Ghost Deploy</p></main></body>
</html>`;
}
