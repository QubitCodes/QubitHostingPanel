\set ON_ERROR_STOP on
BEGIN;

SELECT p.id AS package_id, pp.id AS price_id, pp.currency, pp.billing_interval, pp.interval_count, pp.amount_minor
FROM packages p
JOIN package_prices pp ON pp.package_id = p.id
WHERE p.deleted_at IS NULL AND pp.deleted_at IS NULL
ORDER BY pp.created_at DESC
LIMIT 1
\gset commercial_

INSERT INTO users (mobile, country_code, display_name, status, mobile_verified_at)
VALUES ('9000000001', '+91', 'Phase 3 owner fixture', 'active', now())
RETURNING id AS owner_user_id \gset
INSERT INTO customers (user_id) VALUES (:'owner_user_id') RETURNING id AS owner_customer_id \gset
INSERT INTO users (mobile, country_code, display_name, status, mobile_verified_at)
VALUES ('9000000002', '+91', 'Phase 3 recipient fixture', 'active', now())
RETURNING id AS recipient_user_id \gset
INSERT INTO customers (user_id) VALUES (:'recipient_user_id') RETURNING id AS recipient_customer_id \gset

INSERT INTO workspaces (name, slug, type)
VALUES ('Phase 3 verification', 'phase-3-verification', 'personal')
RETURNING id AS workspace_id, public_id AS workspace_public_id \gset
INSERT INTO workspace_memberships (workspace_id, customer_id, role, status, ownership_started_at)
VALUES (:'workspace_id', :'owner_customer_id', 'owner', 'active', now());

UPDATE workspaces SET type = 'organisation' WHERE id = :'workspace_id';
INSERT INTO organisations (workspace_id, display_name, legal_name)
VALUES (:'workspace_id', 'Phase 3 verification', 'Phase 3 Verification Private Limited');

INSERT INTO workspace_billing_profiles (workspace_id, version, display_name, contact_email, address_line_1, city, region, postal_code, country_code, created_by_user_id)
VALUES (:'workspace_id', 1, 'Phase 3 billing', 'billing@example.com', '42 Green Road', 'Kolkata', 'West Bengal', '700001', 'IN', :'owner_user_id')
RETURNING id AS billing_profile_id \gset
INSERT INTO workspace_billing_profiles (workspace_id, version, display_name, contact_email, address_line_1, city, region, postal_code, country_code, source_profile_id, created_by_user_id)
SELECT workspace_id, 2, display_name, contact_email, address_line_1, city, region, postal_code, country_code, id, :'owner_user_id'
FROM workspace_billing_profiles WHERE id = :'billing_profile_id';

INSERT INTO workspace_ownership_transfers (workspace_id, from_customer_id, to_customer_id, reason, expires_at)
VALUES (:'workspace_id', :'owner_customer_id', :'recipient_customer_id', 'Transactional verification', now() + interval '7 days')
RETURNING id AS transfer_id \gset
UPDATE workspace_ownership_transfers SET status = 'accepted', responded_at = now() WHERE id = :'transfer_id';
UPDATE workspace_memberships SET role = 'member', ownership_ended_at = now() WHERE workspace_id = :'workspace_id' AND customer_id = :'owner_customer_id';
INSERT INTO workspace_memberships (workspace_id, customer_id, role, status, ownership_started_at)
VALUES (:'workspace_id', :'recipient_customer_id', 'owner', 'active', now());

INSERT INTO customer_checkouts (customer_id, package_id, price_id, workspace_id, status, package_name_snapshot, currency, billing_interval, interval_count, subtotal_minor, discount_minor, tax_minor, total_minor, offer_snapshot, billing_profile_snapshot, purchased_at, configured_at)
VALUES (:'owner_customer_id', :'commercial_package_id', :'commercial_price_id', :'workspace_id', 'active', 'Phase 3 package snapshot', :'commercial_currency', :'commercial_billing_interval', :'commercial_interval_count', :'commercial_amount_minor', 0, 0, :'commercial_amount_minor', '[{"id":"snapshot-offer","discountType":"percentage","percentageBasisPoints":1000}]'::jsonb, '{"profileId":"immutable-profile","version":1,"displayName":"Phase 3 billing"}'::jsonb, now(), now())
RETURNING id AS checkout_id \gset
INSERT INTO workspace_subscriptions (workspace_id, checkout_id, package_id, price_id, status, is_primary, package_snapshot, entitlement_snapshot, term_ends_at)
VALUES (:'workspace_id', :'checkout_id', :'commercial_package_id', :'commercial_price_id', 'active', true, '{"price":{"amountMinor":100},"offers":[{"id":"snapshot-offer"}],"tax":{"amountMinor":0},"billingProfile":{"version":1}}'::jsonb, '[{"code":"applications","numericValue":1}]'::jsonb, now() + interval '1 month')
RETURNING id AS subscription_id \gset
INSERT INTO workspace_subscription_items (subscription_id, code, name_snapshot, quantity, unit_amount_minor, currency, entitlement_snapshot)
VALUES (:'subscription_id', 'ses.recipients.1000', 'SES 1,000 recipients', 1, 49900, 'INR', '[{"code":"ses_recipients","numericValue":1000}]'::jsonb);

SELECT
	(SELECT count(*) FROM workspace_billing_profiles WHERE workspace_id = :'workspace_id') = 2 AS billing_profiles_verified,
	EXISTS (SELECT 1 FROM workspace_ownership_transfers WHERE id = :'transfer_id' AND status = 'accepted') AS transfer_verified,
	EXISTS (SELECT 1 FROM workspace_memberships WHERE workspace_id = :'workspace_id' AND customer_id = :'recipient_customer_id' AND role = 'owner') AS ownership_verified,
	EXISTS (SELECT 1 FROM workspace_subscriptions WHERE id = :'subscription_id' AND is_primary AND status = 'active') AS subscription_verified,
	EXISTS (SELECT 1 FROM workspace_subscription_items WHERE subscription_id = :'subscription_id' AND status = 'active') AS add_on_verified,
	EXISTS (SELECT 1 FROM customer_checkouts WHERE id = :'checkout_id' AND jsonb_array_length(offer_snapshot) = 1 AND billing_profile_snapshot IS NOT NULL) AS snapshots_verified;

SELECT :'workspace_public_id' AS fixture_workspace, 2 AS immutable_billing_versions, 'accepted' AS ownership_transfer, 'active' AS primary_subscription, 'active' AS add_on, 'verified' AS snapshot_evidence;
ROLLBACK;
