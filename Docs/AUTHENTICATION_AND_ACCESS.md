# Authentication and Access Model

## 1. Fixed authentication policy

- Password login will never be implemented.
- Admins and customers use the same identity system.
- Initial factors are Firebase SMS OTP and MSG91 WhatsApp OTP.
- WhatsApp delivery uses `@qubitcodes/msg91`.
- Google Sign-In and other Firebase-backed identity providers may be added later.
- One identity may hold admin access and customer/organisation access simultaneously.

## 2. Phone-number login experience

The login form requests only the local mobile number. It does not normally request a country code.

Flow:

1. Normalize and validate the local number.
2. Query active, non-deleted identities.
3. Resolve the stored country code.
4. Build the canonical E.164 number.
5. Create a short-lived OTP challenge.
6. Deliver SMS through the Firebase client flow or WhatsApp through the server-side MSG91 provider, as required by the provider.
7. Verify the provider result on the server.
8. Create an application session with access and refresh tokens.
9. Return available admin and organisation contexts.

Do not reveal whether a number is an administrator or whether a matching record exists. Responses must be generic where disclosure could enable enumeration.

## 3. Identity constraints

Store both:

- Normalized local mobile number for lookup.
- Country calling code.
- Canonical E.164 number as the unique phone identity.
- Firebase UID when assigned.
- Verification and account status timestamps.

Local numbers are not globally unique. If the same local number matches more than one country, the application must not guess. It may request country disambiguation or use a trusted signed onboarding context.

A new customer has no stored country code. Registration must establish it through checkout/onboarding, an invitation, or a signed handoff from the public website. Country-code-free input is primarily an existing-user login convenience.

## 4. OTP service abstraction

```text
OtpService
  FirebaseSmsOtpProvider
  Msg91WhatsAppOtpProvider
```

Provider-specific data stays inside services. Controllers validate requests, call the service, and return standardized responses. A client-driven Firebase step may receive only the minimum safe configuration needed to complete verification.

OTP challenges require expiration, attempt limits, resend cooldown, provider reference, channel, purpose, consumed timestamp, and safe audit metadata. Never store or log plaintext OTPs unnecessarily.

## 5. Unified user and access relationships

Do not create separate admin-user and customer-user identities.

```text
User
  Platform access
    Admin role assignments
    Individual permission overrides
  Customer access
    Organisation ownerships
    Organisation memberships
```

When an administrator registers as a customer, reuse the verified user and create the customer/organisation relationships. When a customer becomes an administrator, add platform access to the same user.

## 6. Context switching

Available contexts may include:

- Platform administration.
- Personal/customer onboarding.
- One or more organisations.

Switching context is a server-authorized action. The backend verifies eligibility and rotates or issues a short-lived access token containing the active context. It is not merely a frontend layout toggle.

Admin permissions never leak into an organisation context. Admin status does not bypass organisation ownership checks. Every protected request validates both user identity and active context.

Recommended access-token claims:

```text
subject user ID
session ID
active context type
active organisation ID when applicable
issued and expiry timestamps
token version
```

## 7. Security controls

- Rate-limit by normalized identity hash, IP, device, purpose, and challenge.
- Apply resend cooldowns and maximum attempts.
- Detect replay and consume challenges once.
- Validate Firebase tokens server-side before creating application sessions.
- Verify MSG91 delivery/verification results server-side.
- Mask phone numbers in logs and responses.
- Never log OTPs, Firebase tokens, refresh tokens, or MSG91 credentials.
- Support session revocation, token rotation, and multi-device sessions.
- Record successful and failed authentication events without recording secrets.
- Consider stricter risk rules for entering an admin context.
