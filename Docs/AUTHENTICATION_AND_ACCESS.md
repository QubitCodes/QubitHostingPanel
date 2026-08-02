# Authentication and Access Model

## 1. Fixed authentication policy

- Password login will never be implemented.
- Admins and customers use the same identity system.
- Initial implemented factor is MSG91 WhatsApp OTP.
- WhatsApp delivery uses `@qubitcodes/msg91`.
- Firebase SMS OTP, Google Sign-In, and other Firebase-backed identity providers are deferred.
- One identity may hold admin access and customer/workspace access simultaneously.

## 2. Phone-number login experience

The login form accepts a registered mobile number with or without its calling code. When an international number is entered, the interface extracts the calling code into a country selector and submits the normalized `countryCode` and `mobile` values.

Flow:

1. Normalize and validate the local number.
2. Query active, non-deleted identities.
3. Resolve the stored country code.
4. Build the canonical E.164 number.
5. Create a short-lived OTP challenge.
6. Ask the published MSG91 SDK to generate and send the OTP with `whatsapp.otp.send({ generate: {} })`, then store only a salted hash of the returned code.
7. Verify the submitted OTP hash on the server, enforce attempt/expiry limits, and consume it once.
8. Create an application session with access and refresh tokens.
9. Ensure the verified user has a customer profile, at least one workspace, and an Owner membership.
10. Return available admin and workspace contexts.

Do not reveal whether a number is an administrator or whether a matching record exists. Responses must be generic where disclosure could enable enumeration.

## 3. Identity constraints

Store both:

- Normalized mobile number and optional country calling code for lookup.
- Country calling code.
- Canonical E.164 number as the unique phone identity.
- External provider subject identifiers when assigned later.
- Verification and account status timestamps.

Local numbers are not globally unique. If the same local number matches more than one country, the application must not guess. It may request country disambiguation or use a trusted signed onboarding context.

A new customer has no stored country code. Registration must establish it through checkout/onboarding, an invitation, or a signed handoff from the public website. Country-code-free input is primarily an existing-user login convenience.

## 4. OTP service abstraction

```text
OtpService
  Msg91WhatsAppOtpProvider
```

Provider-specific data stays inside services. Controllers validate requests, call the service, and return standardized responses. The abstraction must permit a later Firebase provider without changing the unified user/session model.

OTP challenges require expiration, attempt limits, resend cooldown, provider reference, channel, purpose, consumed timestamp, and safe audit metadata. Never store or log plaintext OTPs unnecessarily.

## 5. Unified user and access relationships

Do not create separate admin-user and customer-user identities.

```text
User
  Platform access
    Admin role assignments
    Individual permission overrides
  Customer access
    Customer profile
    Workspace ownerships and memberships
    Optional organisation extensions
```

When an administrator registers as a customer, reuse the verified user and create only missing customer/workspace relationships. When a customer becomes an administrator, add platform access to the same user. Admin status must never block service registration or workspace ownership.

## 6. Context switching

Available contexts may include:

- Platform administration.
- Personal/customer onboarding.
- One or more workspaces, including Personal and Organisation Workspaces.

Switching context is a server-authorized action. The backend verifies eligibility and rotates or issues a short-lived access token containing the active context. It is not merely a frontend layout toggle.

Admin permissions never leak into a workspace context. Admin status does not bypass workspace membership checks. Every protected request validates user identity, active context, active workspace, and membership.

Recommended access-token claims:

```text
subject user ID
session ID
active context type
active workspace ID when applicable
issued and expiry timestamps
token version
```

Every user has at least one workspace after registration/backfill. Personal Workspaces have one Owner at a time and support audited ownership transfer. If transfer would leave the sender without a workspace, the transaction creates a replacement empty Personal Workspace. Organisation multi-user membership is deferred, but the membership model must remain extensible.

## 7. Security controls

- Rate-limit by normalized identity hash, IP, device, purpose, and challenge.
- Apply resend cooldowns and maximum attempts.
- Detect replay and consume challenges once.
- Accept OTP delivery only after `@qubitcodes/msg91` reports a successful generated-code submission.
- Verify OTP hashes and challenge state server-side before creating application sessions.
- Mask phone numbers in logs and responses.
- Never log OTPs, Firebase tokens, refresh tokens, or MSG91 credentials.
- Support session revocation, token rotation, and multi-device sessions.

## User-owned device and session management

Every user can review and manage their own login sessions from `/settings/sessions`. A session records its user-defined device label, parsed browser/OS/device characteristics, safe Client Hints, IP address, approximate proxy-provided location, timezone, optional network ASN/provider, sign-in time, last activity, expiry, and revocation state.

Session metadata is informational. Authorization never trusts device names, user agents, Client Hints, location, or a browser-generated device identifier. Exact GPS coordinates are not requested from the browser; latitude and longitude are stored only when a trusted deployment proxy supplies approximate GeoIP coordinates.

Users may rename an owned device, revoke one owned session, revoke the current session, or revoke all other active sessions. Queries always scope by authenticated user ID before returning or mutating a session. Refresh-token hashes and device-identifier hashes never appear in API responses.

## Administrator management

The `/admin/admins` workspace and `/api/v1/admins` API require an active admin context plus effective action permissions. Administrators are passwordless identities created from a canonical mobile number and assigned one or more platform roles.

Non-Super-Admin callers cannot query, view, update, delete, or assign the Super Admin identity/role. Concealment occurs in database predicates rather than after result retrieval. A caller cannot assign a role or explicit allow containing permissions they do not already hold. The final active Super Admin cannot be suspended, deactivated, deleted, or stripped of the Super Admin role.

Status changes and deletion revoke active sessions. Role changes and permission overrides are audited with actor, target, reason/count metadata, IP, and user agent. Explicit permission denies override role grants and explicit allows for standard administrators. An active Super Admin role authorizes immediately before granular permissions or overrides are evaluated; Super Admin permissions are always enabled and cannot be overridden.
- Record successful and failed authentication events without recording secrets.
- Consider stricter risk rules for entering an admin context.
