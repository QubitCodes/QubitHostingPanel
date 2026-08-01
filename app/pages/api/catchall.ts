import { resp } from '@qubitcodes/qcresp';

/** Ensures unmatched API requests never fall through to an HTML error response. */
export const loader = () => resp.failure(
	'Resource not found.',
	resp.codes.RESOURCE_NOT_FOUND,
	undefined,
	null,
	undefined,
	404
);

export const action = loader;
