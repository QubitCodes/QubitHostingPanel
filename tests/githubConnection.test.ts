import { describe, expect, it } from 'vitest';

import { githubPopupFeatures, githubPopupName } from '@root/app/components/applications/deploy-application-form';

import { deactivateGithubConnectionSchema } from '@schemas/githubConnection';

describe('GitHub connection validation', () => {
	it('centres GitHub setup in a constrained popup window', () => {
		expect(githubPopupFeatures({
			availableHeight: 1080,
			availableWidth: 1920,
			outerHeight: 1000,
			outerWidth: 1600,
			screenX: 100,
			screenY: 20,
		})).toBe('popup=yes,width=720,height=760,left=540,top=140,resizable=yes,scrollbars=yes,toolbar=no,location=no,menubar=no,status=no');
	});
	it('uses a unique browsing-context name instead of reusing a stale tab', () => {
		expect(githubPopupName('ghostdeploy-github-install', 'request-one')).toBe(
			'ghostdeploy-github-install-request-one',
		);
		expect(githubPopupName('ghostdeploy-github-install', 'request-two')).not.toBe(
			'ghostdeploy-github-install-request-one',
		);
	});
	it('requires explicit impact acknowledgement before deactivation', () => {
		expect(deactivateGithubConnectionSchema.safeParse({ acceptedImpact: true }).success).toBe(true);
		expect(deactivateGithubConnectionSchema.safeParse({ acceptedImpact: false }).success).toBe(false);
		expect(deactivateGithubConnectionSchema.safeParse({ acceptedImpact: true, unexpected: true }).success).toBe(false);
	});
});
