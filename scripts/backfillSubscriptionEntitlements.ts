import { backfillSubscriptionEntitlements } from '@services/subscriptions/subscriptionEntitlementBackfillService';

const apply = process.argv.includes('--apply');
const result = await backfillSubscriptionEntitlements(!apply);

console.log(
	JSON.stringify(
		{
			...result,
			nextStep:
				!apply && result.changedSubscriptions
					? 'Run npm run db:backfill:entitlements -- --apply after reviewing this count.'
					: undefined,
		},
		null,
		2,
	),
);
