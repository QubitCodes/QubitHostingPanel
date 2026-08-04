# Payments and provisioning

## Purchase invariant

A browser response never creates commercial ownership or infrastructure by itself. The server recalculates checkout totals, creates a provider attempt, verifies the provider signature/hash and exact amount/currency, persists an idempotent event, then unlocks workspace setup. Workspace setup snapshots the subscription and queues an idempotent provisioning job.

```text
awaiting_payment -> payment_pending -> workspace_setup_pending
                 -> payment_failed

workspace_setup_pending -> provisioning -> active
                                      -> provisioning_failed/retry
```

An eligible no-card trial explicitly enters `workspace_setup_pending` without claiming that money was captured.

## PayU Hosted Checkout

Required environment values:

```env
PAYU_ENABLED=true
PAYU_ENVIRONMENT=test
PAYU_MERCHANT_KEY=
PAYU_MERCHANT_SALT=
```

Use the PayU API key as `PAYU_MERCHANT_KEY` and the 32-bit salt as `PAYU_MERCHANT_SALT`. Client ID, Client Secret, and the 256-bit salt are not used by Hosted Checkout.

Configure the PayU payment webhook as:

```text
https://panel.apps-staging.qubit.codes/api/v1/webhooks/payments/payu
```

The browser success and failure URLs are generated from `APP_URL` and point to `/api/v1/payments/payu/callback`. Both paths validate PayU's reverse SHA-512 hash. The webhook is the durable source; duplicate notifications are accepted as no-ops. Test callbacks require a public HTTPS `APP_URL`; localhost cannot receive PayU redirects or webhooks from the internet without a secure tunnel.

## Razorpay Standard Checkout

```env
RAZORPAY_ENABLED=false
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

The server creates every Razorpay Order. Browser completion is accepted only after HMAC verification and a server-side Payment API fetch confirms the provider order, amount, currency, and captured status. Configure the webhook URL as:

```text
https://panel.apps-staging.qubit.codes/api/v1/webhooks/payments/razorpay
```

Subscribe to `payment.captured`, `payment.failed`, and `order.paid`.

## Mock payments

`mock` appears only when `APP_ENV=development`. The provider factory refuses mock payments in production even if a caller manually submits the provider code.

## Coolify staging

Use a dedicated Coolify staging server. Do not install Coolify beside aaPanel. Create a team-scoped API token with only `read`, `write`, and `deploy` permissions.

```env
HOSTING_PROVIDER=coolify
COOLIFY_ENABLED=true
COOLIFY_BASE_URL=https://coolify.qubit.codes
COOLIFY_API_TOKEN=
COOLIFY_SERVER_UUID=
COOLIFY_DESTINATION_UUID=
COOLIFY_DEFAULT_PROJECT_UUID=
COOLIFY_DEFAULT_ENVIRONMENT_NAME=production
COOLIFY_WILDCARD_DOMAIN=https://apps-staging.qubit.codes
COOLIFY_STARTER_IMAGE=nginx
COOLIFY_STARTER_IMAGE_TAG=alpine
COOLIFY_STARTER_PORT=80
INTERNAL_JOB_SECRET=
```

`COOLIFY_DESTINATION_UUID` is optional when the server has only one destination. The initial purchase test creates a prebuilt starter container through Coolify's Docker Image application endpoint. This proves placement, networking, domain, deployment, idempotency, and reconciliation without requiring a customer Git repository.

The provider accepts the wildcard value as either a hostname, wildcard hostname, or `http(s)` URL and normalizes it before constructing application domains.

Validate from the admin panel at `/admin/operations/providers`. Provisioning state is visible at `/admin/operations/provisioning` and in the customer dashboard.

## Worker execution

Provisioning is never performed inside a payment webhook. Run the worker every minute in staging:

```bash
npm run jobs:process
```

Alternatively call `POST /api/v1/internal/jobs/process` with `x-internal-job-secret`. Jobs use optimistic claiming, deterministic idempotency keys, bounded attempts, exponential retry after errors, and deployment reconciliation without recreating an existing provider resource.

## Staging purchase test

1. Apply the latest migration and run the essential seed.
2. Start with `HOSTING_PROVIDER=mock`; complete pay-now and confirm exactly one workspace, subscription, job, and mock resource.
3. Configure Coolify and verify `/admin/operations/providers` reports connected.
4. Set `HOSTING_PROVIDER=coolify` and restart the panel.
5. Buy a package using PayU test mode.
6. Confirm PayU callback/webhook verification before workspace setup becomes available.
7. Name the workspace and choose its type.
8. Run the job worker until the application reports running.
9. Confirm the application exists once in Coolify and appears in the customer dashboard.
10. Re-deliver the payment webhook and rerun the worker; confirm no duplicate workspace, subscription, job, or Coolify application is created.

AWS EC2 procurement is not part of this integration. Coolify provisions onto a server already registered in Coolify.
