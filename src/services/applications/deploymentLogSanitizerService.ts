const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const CREDENTIAL_URL = /(\b(?:postgres(?:ql)?|mysql|redis|https?):\/\/)([^\s/@:]+):([^\s/@]+)@/gi;
const SECRET_ASSIGNMENT = /\b([A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|PRIVATE_KEY|API_KEY)[A-Z0-9_]*)\s*=\s*([^\s'";]+)/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

/** Removes credentials and provider-only implementation details from customer-visible logs. */
export function sanitizeCustomerDeploymentLog(value: string): string {
	return value
		.replace(CREDENTIAL_URL, '$1[redacted]@')
		.replace(SECRET_ASSIGNMENT, '$1=[redacted]')
		.replace(BEARER, 'Bearer [redacted]')
		.replace(JWT, '[redacted-token]')
		.replace(/\bCoolify\b/gi, 'Ghost Deploy')
		.replace(/Generating nixpacks configuration[^\r\n]*/gi, 'Preparing application build configuration')
		.replace(/\bnixpacks\b/gi, 'automatic builder')
		.replace(/\/artifacts\/[a-z0-9_-]+/gi, '/build/workspace')
		.replace(/docker exec\s+[a-z0-9_-]+\s+bash -c/gi, 'Running deployment step')
		.replace(/\/var\/www\/html\/app\/(?:Jobs|Traits)\/[A-Za-z0-9/_.-]+/g, '[platform-internal]');
}
