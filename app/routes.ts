import {
  index,
  layout,
  prefix,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

export default [
  index("pages/website/home.tsx"),
  route("login", "pages/auth/login.tsx"),
  route("login/verify/:challengeId", "pages/auth/verify.tsx"),
  route("auth/handoff", "pages/auth/handoff.tsx"),
  route("checkout/:packageSlug/:priceId", "pages/customer/checkout.tsx"),
  route("checkout/:checkoutId/payment", "pages/customer/checkout-payment.tsx"),
  route("checkout/:checkoutId/failed", "pages/customer/checkout-failed.tsx"),
  route("checkout/:checkoutId/setup", "pages/customer/checkout-setup.tsx"),
  layout("layouts/customer.tsx", [
    route("dashboard", "pages/customer/overview.tsx"),
    route("dashboard/subscription", "pages/customer/subscription.tsx"),
    route("dashboard/billing", "pages/customer/billing.tsx"),
    route("dashboard/usage", "pages/customer/usage.tsx"),
    route("dashboard/workspace", "pages/customer/workspace.tsx"),
    route("dashboard/security", "pages/customer/security.tsx"),
    route("dashboard/databases", "pages/customer/databases.tsx"),
    route("dashboard/databases/create", "pages/customer/database-create.tsx"),
    route(
      "dashboard/databases/:databaseId",
      "pages/customer/database-detail.tsx",
    ),
    route("dashboard/domains", "pages/customer/domains.tsx"),
    route("dashboard/applications", "pages/customer/applications.tsx"),
    route(
      "dashboard/applications/create",
      "pages/customer/application-create.tsx",
    ),
    route(
      "dashboard/applications/:applicationId",
      "pages/customer/application-detail.tsx",
    ),
    route(
      "dashboard/applications/:applicationId/domains",
      "pages/customer/application-domains.tsx",
    ),
    route(
      "dashboard/workspaces/create",
      "pages/customer/create-workspace-modal.tsx",
    ),
  ]),
  layout("layouts/application.tsx", [
    route("admin/overview", "pages/admin/overview.tsx"),
    route("admin/platform-settings", "pages/admin/platform-settings.tsx"),
    route("admin/packages", "pages/admin/packages.tsx"),
    route("admin/packages/create", "pages/admin/packages-create.tsx"),
    route(
      "admin/packages/:packageSlug/:section",
      "pages/admin/package-detail.tsx",
    ),
    route("admin/offers", "pages/admin/offers.tsx"),
    route("admin/offers/create", "pages/admin/offers-create.tsx"),
    route("admin/offers/:offerSlug", "pages/admin/offer-detail.tsx"),
    route("admin/offers/:offerSlug/edit", "pages/admin/offer-edit.tsx"),
    route(
      "admin/packages/:packageSlug/edit/:section",
      "pages/admin/package-edit.tsx",
    ),
    route("admin/administrators", "pages/admin/admins.tsx"),
    route("admin/customers", "pages/admin/customers.tsx"),
    route("admin/customers/users/:userId", "pages/admin/customer-user.tsx"),
    route("admin/customers/users/:userId/workspaces/:workspaceId", "pages/admin/customer-resources.tsx"),
    route("admin/customers/users/:userId/workspaces/:workspaceId/applications/:applicationId/files", "pages/admin/customer-application-files.tsx"),
    route("admin/customers/:workspaceId", "pages/admin/customer-workspace.tsx"),
    route(
      "admin/customers/:workspaceId/usage",
      "pages/admin/customer-usage.tsx",
    ),
    route("admin/operations/payments", "pages/admin/operations.tsx"),
    route(
      "admin/operations/provisioning",
      "pages/admin/operations-provisioning.tsx",
    ),
    route("admin/operations/providers", "pages/admin/operations-providers.tsx"),
    route("admin/operations/runtime-images", "pages/admin/runtime-images.tsx"),
    route(
      "admin/operations/database-clusters",
      "pages/admin/database-clusters.tsx",
    ),
    route(
      "admin/operations/database-clusters/create",
      "pages/admin/database-cluster-create.tsx",
    ),
    route(
      "admin/operations/database-clusters/:clusterCode",
      "pages/admin/database-cluster-detail.tsx",
    ),
    route(
      "admin/operations/database-clusters/:clusterCode/:section",
      "pages/admin/database-cluster-section.tsx",
    ),
    route(
      "admin/administrators/create",
      "pages/admin/administrators-create.tsx",
    ),
    route(
      "admin/administrators/create/:section",
      "pages/admin/administrator-create-section.tsx",
    ),
    route(
      "admin/administrators/:adminId",
      "pages/admin/administrator-detail.tsx",
    ),
    route(
      "admin/administrators/:adminId/:section",
      "pages/admin/administrator-section.tsx",
    ),
    route(
      "admin/administrators/:adminId/edit/:section",
      "pages/admin/administrator-edit-section.tsx",
    ),
    layout("layouts/settings.tsx", [
      route("settings/profile", "pages/account/profile.tsx"),
      route("settings/security", "pages/account/security.tsx"),
      route("settings/sessions", "pages/account/sessions.tsx"),
      route("settings/sessions/:sessionId", "pages/account/session-detail.tsx"),
    ]),
    route("search/:query", "pages/search.tsx"),
  ]),
  route("api/docs", "pages/api/docs.tsx"),
  ...prefix("api/v1", [
    route("health", "api/v1/health.ts"),
    route("github/callback", "api/v1/github-callback.ts"),
    route("openapi.json", "api/v1/openapi.ts"),
    route("auth/otp/request", "api/v1/auth/otp-request.ts"),
    route("auth/otp/resend", "api/v1/auth/otp-resend.ts"),
    route("auth/mobile-country", "api/v1/auth/mobile-country.ts"),
    route("auth/otp/verify", "api/v1/auth/otp-verify.ts"),
    route("auth/refresh", "api/v1/auth/refresh.ts"),
    route("auth/logout", "api/v1/auth/logout.ts"),
    route("auth/profile", "api/v1/auth/profile.ts"),
    route("auth/context", "api/v1/auth/context.ts"),
    route("auth/handoff", "api/v1/auth/handoff.ts"),
    route("auth/handoff/consume", "api/v1/auth/handoff-consume.ts"),
    route("auth/sessions", "api/v1/auth/sessions.ts"),
    route("auth/sessions/others", "api/v1/auth/sessions-others.ts"),
    route("auth/sessions/:sessionId", "api/v1/auth/session.ts"),
    route("workspaces", "api/v1/workspaces/index.ts"),
    route("workspaces/:workspaceId", "api/v1/workspaces/detail.ts"),
    route("workspaces/:workspaceId/convert", "api/v1/workspaces/convert.ts"),
    route(
      "workspaces/:workspaceId/billing-profiles",
      "api/v1/workspaces/billing-profiles.ts",
    ),
    route(
      "workspaces/:workspaceId/ownership-transfer",
      "api/v1/workspaces/ownership-transfer.ts",
    ),
    route(
      "workspaces/:workspaceId/subscription/cancellation",
      "api/v1/workspaces/subscription-cancellation.ts",
    ),
    route("ownership-transfers", "api/v1/workspaces/ownership-transfers.ts"),
    route(
      "ownership-transfers/:transferId/respond",
      "api/v1/workspaces/ownership-transfer-response.ts",
    ),
    route(
      "workspaces/:workspaceId/resources",
      "api/v1/workspaces/resources.ts",
    ),
    route("workspaces/:workspaceId/usage", "api/v1/workspaces/usage.ts"),
    route(
      "workspaces/:workspaceId/databases",
      "api/v1/workspaces/databases/index.ts",
    ),
    route(
      "workspaces/:workspaceId/databases/name-availability",
      "api/v1/workspaces/databases/name-availability.ts",
    ),
    route(
      "workspaces/:workspaceId/databases/:databaseId/credentials",
      "api/v1/workspaces/databases/credentials.ts",
    ),
    route(
      "workspaces/:workspaceId/databases/:databaseId/rotate",
      "api/v1/workspaces/databases/rotate.ts",
    ),
    route(
      "workspaces/:workspaceId/databases/:databaseId/backups",
      "api/v1/workspaces/databases/backups/index.ts",
    ),
    route(
      "workspaces/:workspaceId/databases/:databaseId/backups/:backupId",
      "api/v1/workspaces/databases/backups/detail.ts",
    ),
    route(
      "workspaces/:workspaceId/databases/:databaseId/backups/:backupId/restore",
      "api/v1/workspaces/databases/backups/restore.ts",
    ),
    route(
      "workspaces/:workspaceId/databases/:databaseId/backups/:backupId/download",
      "api/v1/workspaces/databases/backups/download.ts",
    ),
    route(
      "workspaces/:workspaceId/applications",
      "api/v1/workspaces/applications/index.ts",
    ),
    route(
      "workspaces/:workspaceId/domains",
      "api/v1/workspaces/applications/workspace-domains.ts",
    ),
    route(
      "workspaces/:workspaceId/domain-ownership",
      "api/v1/workspaces/applications/domain-ownership.ts",
    ),
    route(
      "workspaces/:workspaceId/domains/:domainId/dns",
      "api/v1/workspaces/applications/domain-dns.ts",
    ),
    route(
      "workspaces/:workspaceId/domains/:domainId/dns/import",
      "api/v1/workspaces/applications/domain-dns-import.ts",
    ),
    route(
      "workspaces/:workspaceId/domains/:domainId/dns/records",
      "api/v1/workspaces/applications/domain-dns-records.ts",
    ),
    route(
      "workspaces/:workspaceId/domains/:domainId/dns/records/:recordId",
      "api/v1/workspaces/applications/domain-dns-record.ts",
    ),
    route(
      "workspaces/:workspaceId/domain-access/:requestId",
      "api/v1/workspaces/applications/domain-access.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/:applicationId",
      "api/v1/workspaces/applications/detail.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/options",
      "api/v1/workspaces/applications/options.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/analyze-source",
      "api/v1/workspaces/applications/analyze-source.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/github-connections",
      "api/v1/workspaces/applications/github-connections.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/github-connections/:connectionId/repositories",
      "api/v1/workspaces/applications/github-repositories.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/github-connections/:connectionId/sync",
      "api/v1/workspaces/applications/github-sync.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/:applicationId/logs",
      "api/v1/workspaces/applications/logs.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/:applicationId/cron-jobs",
      "api/v1/workspaces/applications/cron-jobs.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/:applicationId/cron-jobs/:cronId",
      "api/v1/workspaces/applications/cron-job.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/:applicationId/cron-jobs/:cronId/executions",
      "api/v1/workspaces/applications/cron-executions.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/:applicationId/domains",
      "api/v1/workspaces/applications/domains.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/:applicationId/domains/:domainId",
      "api/v1/workspaces/applications/domain-detail.ts",
    ),
    route(
      "workspaces/:workspaceId/applications/:applicationId/domains/:domainId/verify",
      "api/v1/workspaces/applications/domain-verify.ts",
    ),
    route("checkouts", "api/v1/checkouts/index.ts"),
    route("checkouts/:checkoutId", "api/v1/checkouts/detail.ts"),
    route("checkouts/:checkoutId/payment", "api/v1/payments/initiate.ts"),
    route("payments/providers", "api/v1/payments/providers.ts"),
    route("payments/payu/callback", "api/v1/payments/payu-callback.ts"),
    route(
      "payments/:provider/callback",
      "api/v1/payments/provider-callback.ts",
    ),
    route("webhooks/payments/:provider", "api/v1/payments/provider-webhook.ts"),
    route("internal/jobs/process", "api/v1/internal/jobs.ts"),
    route("internal/provider/health", "api/v1/internal/provider-health.ts"),
    route("operations/payments", "api/v1/operations/payments.ts"),
    route("operations/provisioning", "api/v1/operations/jobs.ts"),
    route(
      "operations/provisioning/:jobId/retry",
      "api/v1/operations/job-retry.ts",
    ),
    route("operations/provider/health", "api/v1/operations/provider-health.ts"),
    route(
      "operations/provider/connections",
      "api/v1/operations/provider-connections.ts",
    ),
    route(
      "operations/platform-settings",
      "api/v1/operations/platform-settings.ts",
    ),
    route(
      "operations/platform-settings/dns-providers",
      "api/v1/operations/dns-providers.ts",
    ),
    route(
      "operations/platform-settings/dns-providers/:provider",
      "api/v1/operations/dns-provider.ts",
    ),
    route(
      "operations/platform-settings/dns-providers/:provider/validate",
      "api/v1/operations/dns-provider-validate.ts",
    ),
    route(
      "operations/platform-settings/verify",
      "api/v1/operations/platform-settings-verify.ts",
    ),
    route(
      "operations/provider/connections/:connectionId/validate",
      "api/v1/operations/provider-validate.ts",
    ),
    route(
      "operations/provider/connections/:connectionId/rotate",
      "api/v1/operations/provider-rotate.ts",
    ),
    route(
      "operations/provider/connections/:connectionId/reconcile",
      "api/v1/operations/provider-reconcile.ts",
    ),
    route("operations/runtime-images", "api/v1/operations/runtime-images.ts"),
    route(
      "operations/runtime-images/:imageId",
      "api/v1/operations/runtime-image.ts",
    ),
    route(
      "operations/customer-workspaces",
      "api/v1/operations/customer-workspaces.ts",
    ),
    route("operations/users", "api/v1/operations/users.ts"),
    route("operations/users/:userId", "api/v1/operations/user.ts"),
    route("operations/users/:userId/workspaces/:workspaceId", "api/v1/operations/user-workspace.ts"),
    route("operations/users/:userId/sessions/:sessionId", "api/v1/operations/user-session.ts"),
    route("operations/users/:userId/workspaces/:workspaceId/applications/:applicationId/files", "api/v1/operations/application-files.ts"),
    route("operations/users/:userId/workspaces/:workspaceId/applications/:applicationId/control", "api/v1/operations/application-control.ts"),
    route(
      "operations/customer-workspaces/:workspaceId",
      "api/v1/operations/customer-workspace.ts",
    ),
    route(
      "operations/customer-workspaces/:workspaceId/subscription",
      "api/v1/operations/customer-subscription.ts",
    ),
    route(
      "operations/customer-workspaces/:workspaceId/add-ons",
      "api/v1/operations/customer-add-ons.ts",
    ),
    route(
      "operations/customer-workspaces/:workspaceId/add-ons/:itemId",
      "api/v1/operations/customer-add-on.ts",
    ),
    route(
      "operations/customer-workspaces/:workspaceId/usage",
      "api/v1/operations/customer-usage.ts",
    ),
    route(
      "operations/customer-workspaces/:workspaceId/usage/overrides/:overrideId",
      "api/v1/operations/customer-usage-override.ts",
    ),
    route(
      "operations/database-clusters",
      "api/v1/operations/database-clusters/index.ts",
    ),
    route(
      "operations/database-clusters/:clusterCode",
      "api/v1/operations/database-clusters/detail.ts",
    ),
    route(
      "operations/database-clusters/:clusterCode/validate",
      "api/v1/operations/database-clusters/validate.ts",
    ),
    route(
      "operations/database-clusters/:clusterCode/backups",
      "api/v1/operations/database-clusters/backups.ts",
    ),
    route("admins", "api/v1/admins/index.ts"),
    route("admins/options", "api/v1/admins/options.ts"),
    route("admins/:adminId", "api/v1/admins/detail.ts"),
    route("admins/:adminId/roles", "api/v1/admins/roles.ts"),
    route("admins/:adminId/overrides", "api/v1/admins/overrides.ts"),
    route("packages", "api/v1/packages/index.ts"),
    route("packages/:packageSlug", "api/v1/packages/detail.ts"),
    route("packages/:packageSlug/prices", "api/v1/packages/prices.ts"),
    route(
      "packages/:packageSlug/prices/:priceId",
      "api/v1/packages/price-detail.ts",
    ),
    route(
      "packages/:packageSlug/cost-reviews",
      "api/v1/packages/cost-reviews.ts",
    ),
    route(
      "packages/:packageSlug/entitlements",
      "api/v1/packages/entitlements.ts",
    ),
    route("package-categories", "api/v1/package-categories/index.ts"),
    route("offers", "api/v1/offers/index.ts"),
    route("offers/:offerSlug", "api/v1/offers/detail.ts"),
    route("public/catalogue", "api/v1/public/catalogue.ts"),
    route("public/platform", "api/v1/public/platform.ts"),
    route("public/checkout-quotes", "api/v1/public/checkout-quote.ts"),
  ]),
  route("api/*", "pages/api/catchall.ts"),
  route("*", "pages/website/not-found.tsx"),
] satisfies RouteConfig;
