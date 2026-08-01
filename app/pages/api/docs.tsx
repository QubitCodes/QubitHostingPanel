import { ApiReferenceReact } from '@scalar/api-reference-react';

/** Interactive Scalar view backed by the versioned OpenAPI document. */
export default function ApiDocsPage() {
	return (
		<ApiReferenceReact
			configuration={{
				theme: 'saturn',
				url: '/api/v1/openapi.json'
			}}
		/>
	);
}
