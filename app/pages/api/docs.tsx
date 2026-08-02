import {
	apiDocsNotFound,
	authorizeApiDocs,
} from '@services/authorization/apiDocsAuthorizationService';

const SCALAR_HTML = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Qubit Hosting API Reference</title>
	</head>
	<body>
		<script id="api-reference" type="application/json">{"theme":"saturn","url":"/api/v1/openapi.json"}</script>
		<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.64.0"></script>
	</body>
</html>`;

/** Serves Scalar as a protected resource document without a React runtime wrapper. */
export async function loader({ request }: { request: Request }): Promise<Response> {
	if (!(await authorizeApiDocs(request))) return apiDocsNotFound();
	return new Response(SCALAR_HTML, {
		headers: {
			'cache-control': 'private, no-store',
			'content-type': 'text/html; charset=utf-8',
		},
	});
}
