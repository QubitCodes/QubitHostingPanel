/** Phase 0 OpenAPI contract; feature phases extend this document with shared Zod schemas. */
export const OPENAPI_DOCUMENT = {
	openapi: '3.1.0',
	info: {
		title: 'Ghost Deploy API',
		version: '0.1.0',
		description: 'Versioned APIs for the standalone Ghost Deploy platform.',
	},
	servers: [{ url: '/api/v1' }],
	paths: {
		'/openapi.json': {
			get: {
				description:
					'Requires Super Admin access or the api_docs.view permission. Unauthorized callers receive an indistinguishable JSON 404.',
				operationId: 'showOpenApiContract',
				responses: {
					'200': { description: 'Protected OpenAPI contract.' },
					'404': { description: 'Resource not found.' },
				},
				security: [{ bearerAuth: [] }],
				summary: 'View the protected OpenAPI contract',
			},
		},
		'/auth/otp/request': {
			post: {
				description:
					'Creates a WhatsApp OTP challenge for an existing user or a new registration when countryCode is supplied. An explicitly enabled local development runtime may authenticate an existing verified user through the guarded leading development marker.',
				summary: 'Request a WhatsApp login OTP',
				operationId: 'requestWhatsAppOtp',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/OtpRequest' },
						},
					},
				},
				responses: {
					'200': {
						description:
							'Local development authentication completed when its guarded bypass is enabled.',
					},
					'202': { description: 'Enumeration-safe OTP request accepted.' },
					'400': { description: 'Validation error.' },
				},
			},
		},
		'/auth/mobile-country': {
			post: {
				description:
					'Resolves whether an unprefixed national mobile number requires explicit country selection. The response never returns customer or account details.',
				summary: 'Resolve mobile country requirement',
				operationId: 'resolveMobileCountry',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['mobile'],
								properties: {
									mobile: {
										type: 'string',
										pattern: '^\\d{8,15}$',
										example: '7907577655',
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description:
							'Returns only whether country selection is required and a visitor-country suggestion.',
					},
					'400': { description: 'Validation error.' },
				},
			},
		},
		'/auth/otp/verify': {
			post: {
				summary: 'Verify a WhatsApp OTP and create a session',
				operationId: 'verifyWhatsAppOtp',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/OtpVerification' },
						},
					},
				},
				responses: {
					'200': { description: 'Authentication successful.' },
					'401': { description: 'OTP invalid or expired.' },
				},
			},
		},
		'/auth/otp/resend': {
			post: {
				description:
					'Resends the current code while more than one minute remains. During the final minute, rotates the code and starts a fresh expiry window.',
				summary: 'Resend the active WhatsApp OTP',
				operationId: 'resendWhatsAppOtp',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['challengeId'],
								properties: { challengeId: { type: 'string', format: 'uuid' } },
							},
						},
					},
				},
				responses: {
					'202': { description: 'Current or newly rotated OTP sent.' },
					'429': {
						description: 'Resend cooldown is active or the challenge expired.',
					},
				},
			},
		},
		'/auth/refresh': {
			post: {
				summary: 'Rotate a refresh token',
				operationId: 'refreshSession',
				responses: {
					'200': { description: 'Session refreshed.' },
					'401': { description: 'Refresh token invalid.' },
				},
			},
		},
		'/auth/logout': {
			post: {
				summary: 'Revoke the bearer session',
				operationId: 'logout',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Session revoked.' },
					'401': { description: 'Authentication required.' },
				},
			},
		},
		'/auth/profile': {
			get: {
				summary: 'Retrieve server-authorized navigation capabilities',
				operationId: 'showAuthenticationProfile',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description: 'Identity, available contexts, and dashboard access.',
					},
					'401': { description: 'Authentication required.' },
				},
			},
		},
		'/auth/handoff': {
			post: {
				summary: 'Create a single-use panel session handoff',
				operationId: 'createAuthenticationHandoff',
				security: [{ bearerAuth: [] }],
				responses: {
					'201': { description: 'Origin-bound two-minute handoff created.' },
					'422': { description: 'Target origin is not configured.' },
				},
			},
		},
		'/auth/handoff/consume': {
			post: {
				summary: 'Consume a single-use panel session handoff',
				operationId: 'consumeAuthenticationHandoff',
				responses: {
					'200': { description: 'A new panel-origin session was created.' },
					'401': {
						description:
							'Handoff is invalid, expired, consumed, or origin-mismatched.',
					},
				},
			},
		},
		'/auth/context': {
			post: {
				summary: 'Switch personal or authorized admin context',
				operationId: 'switchContext',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Context switched with caller capabilities, including API documentation visibility.',
					},
					'403': { description: 'Context is not permitted.' },
				},
			},
		},
		'/auth/sessions': {
			get: {
				summary: 'List every session owned by the current user',
				operationId: 'listSessions',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Owned sessions with safe device and network metadata.',
					},
					'401': { description: 'Authentication required.' },
				},
			},
		},
		'/auth/sessions/{sessionId}': {
			get: {
				summary: 'View one owned session',
				operationId: 'getSession',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/SessionId' }],
				responses: {
					'200': { description: 'Owned session.' },
					'404': { description: 'Session not found.' },
				},
			},
			patch: {
				summary: 'Label one owned device session',
				operationId: 'labelSession',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/SessionId' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/SessionLabel' },
						},
					},
				},
				responses: {
					'200': { description: 'Device label updated.' },
					'404': { description: 'Session not found.' },
				},
			},
			delete: {
				summary: 'Revoke one owned session',
				operationId: 'revokeSession',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/SessionId' }],
				responses: {
					'200': { description: 'Session revoked.' },
					'404': { description: 'Active session not found.' },
				},
			},
		},
		'/auth/sessions/others': {
			delete: {
				summary: 'Revoke all other owned sessions',
				operationId: 'revokeOtherSessions',
				security: [{ bearerAuth: [] }],
				responses: { '200': { description: 'Other active sessions revoked.' } },
			},
		},
		'/packages': {
			get: {
				summary: 'List packages for administration',
				operationId: 'listPackages',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Active package records, including drafts and archived packages.',
					},
					'403': { description: 'packages.view permission required.' },
				},
			},
			post: {
				summary: 'Create a commercial package',
				operationId: 'createPackage',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/PackageInput' },
						},
					},
				},
				responses: {
					'201': { description: 'Package created.' },
					'400': { description: 'Validation or duplicate-slug error.' },
					'403': {
						description:
							'packages.create permission required; packages.publish is additionally required for non-draft creation.',
					},
				},
			},
		},
		'/packages/{packageSlug}': {
			get: {
				summary: 'View one package and its audit history',
				operationId: 'showPackage',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				responses: {
					'200': { description: 'Package details.' },
					'404': { description: 'Package not found.' },
				},
			},
			patch: {
				summary: 'Update or publish a package',
				operationId: 'updatePackage',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/PackageInput' },
						},
					},
				},
				responses: {
					'200': { description: 'Package updated.' },
					'403': { description: 'Required package permission missing.' },
					'404': { description: 'Package not found.' },
				},
			},
			delete: {
				summary: 'Soft-delete a package',
				operationId: 'deletePackage',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				responses: {
					'200': { description: 'Package deleted.' },
					'404': { description: 'Package not found.' },
				},
			},
		},
		'/packages/{packageSlug}/prices': {
			post: {
				summary: 'Create new monthly and yearly package price versions',
				operationId: 'setPackagePrices',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/PackagePricesInput' },
						},
					},
				},
				responses: {
					'200': {
						description:
							'New active prices created and prior active prices retained as history.',
					},
					'403': { description: 'packages.update permission required.' },
					'404': { description: 'Package not found.' },
				},
			},
		},
		'/packages/{packageSlug}/prices/{priceId}': {
			get: {
				summary: 'Inspect active customer impact before deleting a price',
				operationId: 'packagePriceDeletionImpact',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				responses: {
					'200': { description: 'Active user count and latest term end.' },
				},
			},
			delete: {
				summary:
					'Remove a price from future purchases without changing active customer terms',
				operationId: 'deletePackagePrice',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				responses: {
					'200': {
						description: 'Price soft-deleted; active assignments remain valid.',
					},
				},
			},
		},
		'/packages/{packageSlug}/cost-reviews': {
			post: {
				summary: 'Record an AWS cost and margin review',
				operationId: 'createPackageCostReview',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/PackageCostReviewInput' },
						},
					},
				},
				responses: {
					'201': {
						description: 'Cost review recorded with server-calculated margin.',
					},
					'403': { description: 'packages.publish permission required.' },
				},
			},
		},
		'/packages/{packageSlug}/entitlements': {
			post: {
				summary: 'Replace package entitlements for future purchases',
				operationId: 'setPackageEntitlements',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				responses: {
					'200': { description: 'Entitlements updated.' },
					'403': { description: 'packages.update permission required.' },
				},
			},
		},
		'/offers': {
			get: {
				summary: 'List offers and coupons',
				operationId: 'listOffers',
				security: [{ bearerAuth: [] }],
				responses: { '200': { description: 'Offers retrieved.' } },
			},
			post: {
				summary: 'Create an offer or coupon',
				operationId: 'createOffer',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/OfferInput' },
						},
					},
				},
				responses: { '201': { description: 'Offer created.' } },
			},
		},
		'/offers/{offerSlug}': {
			get: {
				summary: 'View an offer',
				operationId: 'showOffer',
				security: [{ bearerAuth: [] }],
				responses: { '200': { description: 'Offer retrieved.' } },
			},
			patch: {
				summary: 'Update an offer',
				operationId: 'updateOffer',
				security: [{ bearerAuth: [] }],
				responses: { '200': { description: 'Offer updated.' } },
			},
			delete: {
				summary: 'Soft-delete an offer',
				operationId: 'deleteOffer',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['confirmationName'],
								properties: {
									confirmationName: {
										type: 'string',
										description: 'Exact offer slug.',
									},
									acceptedImpact: { type: 'boolean' },
									connectedResourceNames: {
										type: 'array',
										items: { type: 'string' },
									},
								},
							},
						},
					},
				},
				responses: {
					'200': { description: 'Offer deleted.' },
					'422': { description: 'Typed confirmation does not match.' },
				},
			},
		},
		'/workspaces': {
			get: {
				summary: 'List workspaces available to the authenticated customer',
				operationId: 'listWorkspaces',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Workspace memberships retrieved.' },
					'401': { description: 'Authentication required.' },
				},
			},
		},
		'/checkouts': {
			post: {
				summary: 'Persist an authenticated purchase from a signed server quote',
				operationId: 'purchaseCheckout',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['quoteToken'],
								properties: { quoteToken: { type: 'string', minLength: 32 } },
							},
						},
					},
				},
				responses: {
					'201': {
						description: 'Purchase persisted; workspace setup required.',
					},
					'401': { description: 'Authentication required.' },
					'422': { description: 'Quote invalid or expired.' },
				},
			},
		},
		'/checkouts/{checkoutId}': {
			get: {
				summary: 'Retrieve an owned purchase checkout',
				operationId: 'showCheckout',
				security: [{ bearerAuth: [] }],
				parameters: [
					{
						in: 'path',
						name: 'checkoutId',
						required: true,
						schema: { type: 'integer', minimum: 100000, maximum: 999999 },
					},
				],
				responses: {
					'200': { description: 'Checkout retrieved.' },
					'404': { description: 'Checkout not found.' },
				},
			},
			post: {
				summary: 'Create and configure the purchased workspace',
				operationId: 'configureCheckoutWorkspace',
				security: [{ bearerAuth: [] }],
				parameters: [
					{
						in: 'path',
						name: 'checkoutId',
						required: true,
						schema: { type: 'integer', minimum: 100000, maximum: 999999 },
					},
				],
				responses: {
					'201': {
						description:
							'Workspace and subscription created from purchase snapshots.',
					},
					'422': {
						description: 'Checkout already configured or input invalid.',
					},
				},
			},
		},
		'/checkouts/{checkoutId}/payment': {
			post: {
				summary: 'Create a payment-provider session for an owned checkout',
				operationId: 'initiateCheckoutPayment',
				security: [{ bearerAuth: [] }],
				responses: {
					'201': {
						description:
							'PayU redirect form, Razorpay order, or development mock session created.',
					},
					'422': { description: 'Checkout cannot accept payment.' },
					'502': { description: 'Payment provider unavailable.' },
				},
			},
		},
		'/payments/providers': {
			get: {
				summary: 'List payment providers enabled for this environment',
				operationId: 'listPaymentProviders',
				responses: { '200': { description: 'Enabled provider codes.' } },
			},
		},
		'/payments/payu/callback': {
			post: {
				summary: 'Validate PayU Hosted Checkout browser response',
				operationId: 'payuPaymentCallback',
				responses: {
					'303': { description: 'Verified redirect to setup or failure page.' },
					'400': { description: 'Hash verification failed.' },
				},
			},
		},
		'/payments/{provider}/callback': {
			post: {
				summary: 'Verify Razorpay or development mock browser completion',
				operationId: 'paymentProviderCallback',
				responses: {
					'200': { description: 'Payment verified.' },
					'400': { description: 'Signature verification failed.' },
				},
			},
		},
		'/webhooks/payments/{provider}': {
			post: {
				summary: 'Receive an idempotent verified payment webhook',
				operationId: 'paymentWebhook',
				responses: {
					'200': { description: 'Webhook accepted or already processed.' },
					'400': { description: 'Webhook verification failed.' },
				},
			},
		},
		'/webhooks/coolify': {
			post: {
				summary: 'Receive authenticated Coolify deployment notifications',
				operationId: 'receiveCoolifyWebhook',
				parameters: [
					{
						in: 'query',
						name: 'secret',
						required: true,
						schema: { type: 'string' },
					},
				],
				responses: {
					'200': {
						description:
							'Known provider resource reconciled and live event published.',
					},
					'400': { description: 'Unsupported payload.' },
					'404': { description: 'Webhook secret is invalid.' },
				},
			},
		},
		'/workspaces/{workspaceId}/resources': {
			get: {
				summary: 'List owned workspace provisioning jobs and resources',
				operationId: 'listWorkspaceResources',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Provisioning and resource state.' },
					'404': { description: 'Workspace not found.' },
				},
			},
		},
		'/workspaces/{workspaceId}/domains/{domainId}/dns': {
			get: {
				summary:
					'View an owned root-domain DNS zone, records, and managed subdomains',
				operationId: 'showDomainDns',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'DNS configuration retrieved.' },
					'404': { description: 'Domain is not owned by this workspace.' },
				},
			},
			post: {
				summary:
					'Enable managed DNS, synchronize records, or refresh nameserver delegation',
				operationId: 'updateDomainDnsLifecycle',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['action'],
								properties: {
									action: {
										type: 'string',
										enum: ['provision', 'sync', 'refresh'],
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description:
							'DNS lifecycle updated without exposing the backing authoritative provider.',
					},
					'502': {
						description: 'Managed DNS or public delegation lookup unavailable.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/domains/{domainId}/dns/import': {
			post: {
				summary: 'Capture current DNS into a review draft',
				description:
					'Supports a credential-free public scan, BIND zone text, and one-request GoDaddy or Hostinger API token capture. Provider tokens are not persisted.',
				operationId: 'importDomainDns',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Discovered records merged into the draft.' },
					'502': { description: 'Source provider unavailable.' },
				},
			},
		},
		'/workspaces/{workspaceId}/domains/{domainId}/dns/records': {
			post: {
				summary: 'Create and immediately publish a customer-managed DNS record',
				operationId: 'createDomainDnsRecord',
				security: [{ bearerAuth: [] }],
				responses: {
					'201': {
						description:
							'DNS record saved and published when managed DNS is enabled.',
					},
					'422': { description: 'Record conflicts with DNS rules.' },
				},
			},
		},
		'/workspaces/{workspaceId}/domains/{domainId}/dns/records/{recordId}': {
			patch: {
				summary: 'Update and immediately publish a customer-managed DNS record',
				operationId: 'updateDomainDnsRecord',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description: 'DNS record updated in place and synchronized.',
					},
					'422': { description: 'Platform-managed records cannot be edited.' },
				},
			},
			delete: {
				summary: 'Soft-delete a customer-managed DNS record',
				operationId: 'deleteDomainDnsRecord',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['confirmationName'],
								properties: {
									confirmationName: { type: 'string', example: 'A www' },
									acceptedImpact: { type: 'boolean' },
									connectedResourceNames: {
										type: 'array',
										items: { type: 'string' },
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description:
							'DNS record removed locally and from the authoritative provider.',
					},
				},
			},
		},
		'/internal/jobs/process': {
			post: {
				summary: 'Process a bounded provisioning-job batch',
				operationId: 'processProvisioningJobs',
				responses: {
					'200': { description: 'Batch result.' },
					'404': { description: 'Hidden when worker secret is invalid.' },
				},
			},
		},
		'/internal/provider/health': {
			get: {
				summary: 'Validate the configured hosting provider',
				operationId: 'hostingProviderHealth',
				responses: {
					'200': { description: 'Provider connected.' },
					'502': { description: 'Provider unavailable.' },
				},
			},
		},
		'/internal/traffic-policy/config': {
			get: {
				description:
					'Returns the least-privilege customer-domain routing contract used by the root-owned Traefik policy synchronizer. Invalid worker secrets receive an indistinguishable JSON 404.',
				summary: 'Retrieve managed traffic policy configuration',
				operationId: 'getManagedTrafficPolicyConfig',
				parameters: [
					{
						name: 'x-internal-job-secret',
						in: 'header',
						required: true,
						schema: { type: 'string' },
					},
				],
				responses: {
					'200': {
						description:
							'Policy revision, safe endpoint URLs, and provider/domain routing metadata.',
					},
					'404': { description: 'Resource not found.' },
					'503': { description: 'Policy configuration unavailable.' },
				},
			},
		},
		'/operations/provider/connections': {
			get: {
				summary: 'List sanitized Coolify connections and imported inventory',
				operationId: 'listProviderConnections',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Connections, reconciliation runs, and inventory returned without token material.',
					},
					'403': { description: 'provisioning.view permission required.' },
				},
			},
			post: {
				summary: 'Validate and save an encrypted Coolify connection',
				operationId: 'createProviderConnection',
				security: [{ bearerAuth: [] }],
				responses: {
					'201': {
						description: 'Connection validated and encrypted token stored.',
					},
					'403': { description: 'provisioning.create permission required.' },
					'502': { description: 'Provider validation failed.' },
				},
			},
		},
		'/operations/provider/connections/{connectionId}/validate': {
			post: {
				summary: 'Validate a database-managed Coolify connection',
				operationId: 'validateProviderConnection',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Connection validated.' },
					'502': { description: 'Provider unavailable.' },
				},
			},
		},
		'/operations/provider/connections/{connectionId}/rotate': {
			post: {
				summary: 'Validate and atomically activate a new encrypted API token',
				operationId: 'rotateProviderToken',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description: 'New token activated and previous token retired.',
					},
					'502': {
						description:
							'Candidate token validation failed; previous token remains active.',
					},
				},
			},
		},
		'/operations/provider/connections/{connectionId}/reconcile': {
			post: {
				summary: 'Import and reconcile scoped Coolify inventory',
				operationId: 'reconcileProviderConnection',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Servers, applications, databases, services, and deployments reconciled without creating commercial ownership.',
					},
					'502': { description: 'Reconciliation failed.' },
				},
			},
		},
		'/operations/runtime-images': {
			get: {
				summary: 'List the complete admin runtime catalogue',
				operationId: 'listRuntimeImages',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Active, deprecated, and disabled runtime images returned.',
					},
				},
			},
			post: {
				summary: 'Create an approved runtime image',
				operationId: 'createRuntimeImage',
				security: [{ bearerAuth: [] }],
				responses: {
					'201': { description: 'Runtime image created.' },
					'400': { description: 'Image reference or code conflicts.' },
				},
			},
		},
		'/operations/runtime-images/{imageId}': {
			patch: {
				summary: 'Update runtime metadata, default, or lifecycle',
				operationId: 'updateRuntimeImage',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Runtime image updated.' },
					'404': { description: 'Runtime image not found.' },
				},
			},
			delete: {
				summary: 'Soft-delete an unused runtime image',
				operationId: 'deleteRuntimeImage',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Unused runtime image soft-deleted.' },
					'422': {
						description: 'Build history exists; disable the runtime instead.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}': {
			get: {
				summary: 'View an authorized workspace by its six-digit public ID',
				operationId: 'showWorkspace',
				security: [{ bearerAuth: [] }],
				parameters: [
					{
						in: 'path',
						name: 'workspaceId',
						required: true,
						schema: { type: 'integer', minimum: 100000, maximum: 999999 },
					},
				],
				responses: {
					'200': {
						description:
							'Workspace retrieved with every current and historical subscription snapshot plus sanitized payment history.',
					},
					'401': { description: 'Authentication required.' },
					'404': { description: 'Workspace not found or inaccessible.' },
				},
			},
			patch: {
				summary: 'Update workspace deployment compatibility defaults',
				operationId: 'updateWorkspaceCompatibility',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['autoCharsetFix'],
								additionalProperties: false,
								properties: { autoCharsetFix: { type: 'boolean', default: true } },
							},
						},
					},
				},
				responses: {
					'200': { description: 'Compatibility setting updated and audit logged.' },
					'403': { description: 'Workspace owner or administrator permission required.' },
				},
			},
		},
		'/public/catalogue': {
			get: {
				summary:
					'Retrieve published packages, current public prices, and visible entitlements',
				operationId: 'publicCatalogue',
				responses: { '200': { description: 'Public catalogue retrieved.' } },
			},
		},
		'/public/checkout-quotes': {
			post: {
				summary: 'Create a server-calculated signed checkout quote',
				operationId: 'createCheckoutQuote',
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/CheckoutQuoteInput' },
						},
					},
				},
				responses: {
					'201': { description: 'Signed short-lived quote created.' },
					'422': {
						description: 'Coupon invalid, expired, exhausted, or ineligible.',
					},
				},
			},
		},
		'/public/platform': {
			get: {
				summary: 'Retrieve public platform URL configuration',
				operationId: 'showPublicPlatformConfiguration',
				responses: {
					'200': {
						description:
							'Effective public, panel, and application-domain configuration.',
					},
				},
			},
		},
		'/package-categories': {
			get: {
				summary: 'List active package categories and inline-create capability',
				operationId: 'listPackageCategories',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Active package categories.' },
					'403': {
						description: 'package_categories.view permission required.',
					},
				},
			},
			post: {
				summary: 'Create a package category',
				operationId: 'createPackageCategory',
				security: [{ bearerAuth: [] }],
				responses: {
					'201': { description: 'Package category created.' },
					'403': {
						description: 'package_categories.create permission required.',
					},
				},
			},
		},
		'/admins': {
			get: {
				summary: 'List visible platform administrators',
				operationId: 'listAdmins',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Permission-scoped administrator list with public IDs, role summaries, and active permission-override indicators.',
					},
					'403': { description: 'Admin permission required.' },
				},
			},
			post: {
				summary: 'Create a passwordless administrator',
				operationId: 'createAdmin',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: { $ref: '#/components/schemas/CreateAdmin' },
						},
					},
				},
				responses: {
					'201': { description: 'Administrator created.' },
					'403': { description: 'Role assignment is not permitted.' },
				},
			},
		},
		'/admins/{adminId}': {
			get: {
				summary: 'View an administrator and security history',
				operationId: 'getAdmin',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/AdminId' }],
				responses: {
					'200': { description: 'Administrator detail.' },
					'404': { description: 'Administrator hidden or absent.' },
				},
			},
			patch: {
				summary: 'Update administrator profile or status',
				operationId: 'updateAdmin',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/AdminId' }],
				responses: {
					'200': { description: 'Administrator updated.' },
					'422': { description: 'Final Super Admin protection.' },
				},
			},
			delete: {
				summary: 'Soft-delete an administrator',
				operationId: 'deleteAdmin',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/AdminId' }],
				responses: {
					'200': { description: 'Administrator deleted and sessions revoked.' },
					'422': { description: 'Final Super Admin protection.' },
				},
			},
		},
		'/admins/{adminId}/roles': {
			put: {
				summary: 'Replace administrator roles',
				operationId: 'replaceAdminRoles',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/AdminId' }],
				responses: {
					'200': { description: 'Roles updated.' },
					'403': { description: 'Role would escalate privileges.' },
				},
			},
		},
		'/admins/{adminId}/overrides': {
			put: {
				summary: 'Replace explicit permission overrides',
				operationId: 'replaceAdminOverrides',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/AdminId' }],
				responses: {
					'200': { description: 'Overrides updated.' },
					'403': { description: 'Override would escalate privileges.' },
				},
			},
		},
		'/admins/options': {
			get: {
				summary: 'List assignable roles, inherited grants, and permissions',
				operationId: 'getAdminOptions',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Caller-scoped role and permission options, including each role permission assignment.',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/AdminOptionsResponse' },
							},
						},
					},
					'403': { description: 'Role visibility permission required.' },
				},
			},
		},
		'/health': {
			get: {
				summary: 'Check application process health',
				operationId: 'getHealth',
				responses: {
					'200': {
						description: 'Application process is healthy.',
						content: {
							'application/json': {
								schema: { $ref: '#/components/schemas/HealthResponse' },
							},
						},
					},
				},
			},
		},
		'/operations/database-clusters': {
			get: {
				summary: 'List shared database clusters',
				operationId: 'listDatabaseClusters',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Cluster list without encrypted credentials.' },
					'403': { description: 'Permission denied.' },
				},
			},
			post: {
				summary: 'Provision a private shared database cluster',
				operationId: 'createDatabaseCluster',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: [
									'code',
									'engine',
									'name',
									'maximumDatabases',
									'limitsMemory',
									'limitsCpus',
								],
								properties: {
									code: {
										type: 'string',
										pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
									},
									engine: { type: 'string', enum: ['postgresql', 'mysql'] },
									name: { type: 'string', description: 'Customer-controlled identifier suffix. The server prepends the immutable workspace public-ID prefix.' },
									maximumDatabases: { type: 'integer', minimum: 1 },
									limitsMemory: { type: 'string', example: '1g' },
									limitsCpus: { type: 'string', example: '1' },
								},
							},
						},
					},
				},
				responses: {
					'201': { description: 'Coolify cluster creation started.' },
					'400': { description: 'Validation or duplicate code error.' },
					'403': { description: 'Permission denied.' },
					'502': { description: 'Coolify provisioning failed.' },
				},
			},
		},
		'/operations/database-clusters/{clusterCode}': {
			get: {
				summary: 'View a shared database cluster',
				operationId: 'showDatabaseCluster',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/ClusterCode' }],
				responses: {
					'200': {
						description: 'Cluster detail without encrypted credentials.',
					},
					'404': { description: 'Cluster not found.' },
				},
			},
			patch: {
				summary: 'Update cluster capacity or lifecycle state',
				operationId: 'updateDatabaseCluster',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/ClusterCode' }],
				responses: {
					'200': { description: 'Cluster updated.' },
					'400': { description: 'Validation error.' },
					'404': { description: 'Cluster not found.' },
				},
			},
		},
		'/operations/database-clusters/{clusterCode}/validate': {
			post: {
				summary: 'Reconcile cluster health with Coolify',
				operationId: 'validateDatabaseCluster',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/ClusterCode' }],
				responses: {
					'200': { description: 'Provider health recorded.' },
					'502': { description: 'Provider validation failed.' },
				},
			},
		},
		'/operations/database-clusters/{clusterCode}/backups': {
			post: {
				summary: 'Configure scheduled Coolify database backups',
				operationId: 'configureDatabaseClusterBackup',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/ClusterCode' }],
				responses: {
					'201': { description: 'Backup policy configured.' },
					'502': { description: 'Provider backup configuration failed.' },
				},
			},
		},
		'/workspaces/{workspaceId}/databases': {
			get: {
				summary: 'List workspace databases',
				operationId: 'listWorkspaceDatabases',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': {
						description: 'Workspace database list without credentials.',
					},
					'404': { description: 'Workspace not found.' },
				},
			},
			post: {
				summary: 'Create a restricted logical database',
				operationId: 'createWorkspaceDatabase',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['engine', 'name'],
								properties: {
									engine: { type: 'string', enum: ['postgresql', 'mysql'] },
									name: { type: 'string' },
									userMode: { type: 'string', enum: ['new', 'existing'], default: 'new' },
									username: { type: 'string', description: 'Customer-controlled login suffix when creating a new database user. The server prepends the workspace prefix; defaults to the database suffix.' },
									password: { type: 'string', format: 'password', minLength: 16, description: 'Optional strong password chosen for a new database user. Omit to generate it on the server. Never accepted for an existing user.' },
									databaseUserId: { type: 'string', format: 'uuid', description: 'Required when userMode is existing.' },
									connectionLimit: {
										type: 'integer',
										minimum: 1,
										maximum: 100,
									},
									storageQuotaMb: {
										type: 'integer',
										minimum: 128,
										maximum: 102400,
									},
								},
							},
						},
					},
				},
				responses: {
					'201': {
						description:
							'Database created. A generated credential is returned only for a new database user; an existing user password is never regenerated or exposed.',
					},
					'422': { description: 'Workspace entitlement limit reached.' },
					'503': { description: 'No healthy cluster has capacity.' },
				},
			},
		},
		'/workspaces/{workspaceId}/database-users': {
			get: {
				summary: 'List reusable workspace database users',
				operationId: 'listWorkspaceDatabaseUsers',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ in: 'query', name: 'engine', schema: { type: 'string', enum: ['postgresql', 'mysql'] } },
				],
				responses: {
					'200': { description: 'Reusable users returned without credentials.' },
					'404': { description: 'Workspace not found.' },
				},
			},
		},
		'/workspaces/{workspaceId}/databases/name-availability': {
			get: {
				summary: 'Check workspace database name availability',
				operationId: 'checkWorkspaceDatabaseNameAvailability',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{
						name: 'name',
						in: 'query',
						required: true,
						schema: { type: 'string', pattern: '^[a-z0-9]+(?:_[a-z0-9]+)*$' },
					},
				],
				responses: {
					'200': { description: 'Database name availability result.' },
					'400': { description: 'Database name is invalid.' },
					'404': { description: 'Workspace not found.' },
				},
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}': {
			delete: {
				summary: 'Permanently delete a workspace database',
				operationId: 'deleteWorkspaceDatabase',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/DatabaseId' },
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['confirmationName'],
								properties: {
									confirmationName: { type: 'string' },
									acceptedImpact: { type: 'boolean' },
									connectedApplicationNames: {
										type: 'array',
										items: { type: 'string' },
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description:
							'Physical database removed and local records soft-deleted.',
					},
					'404': { description: 'Database not found.' },
					'422': {
						description:
							'Confirmation or live dependency state does not match.',
					},
					'500': {
						description:
							'Infrastructure deletion failed; local database remains active.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/credentials': {
			post: {
				summary: 'Reveal an encrypted workspace database credential',
				operationId: 'revealWorkspaceDatabaseCredential',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/DatabaseId' },
				],
				responses: {
					'200': { description: 'Credential revealed and audited.' },
					'404': { description: 'Database not found in the workspace.' },
				},
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/rotate': {
			post: {
				summary: 'Rotate a workspace database password',
				operationId: 'rotateWorkspaceDatabaseCredential',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/DatabaseId' },
				],
				requestBody: {
					required: true,
					content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['acceptedImpact'], properties: { acceptedImpact: { type: 'boolean', enum: [true] } } } } },
				},
				responses: {
					'200': {
						description:
							'Password rotated, encrypted, and returned for controlled display.',
					},
					'404': { description: 'Database not found in the workspace.' },
				},
			},
		},
		'/databases/{databaseId}/context': {
			get: {
				summary: 'Resolve an authorized standalone database-manager context',
				operationId: 'getDatabaseManagerContext',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/DatabaseId' }],
				responses: {
					'200': { description: 'Database, workspace, and connected-application context returned without credentials.' },
					'401': { description: 'Authentication is missing, expired, or no longer maps to an active session.' },
					'404': { description: 'Database not found or inaccessible.' },
					'500': { description: 'Database context could not be loaded because of an internal service or schema failure.' },
				},
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/explorer/objects': {
			get: {
				summary: 'Browse schemas, tables, views, and object structure',
				operationId: 'browseWorkspaceDatabaseObjects',
				description: 'Uses the isolated logical-database credential on the server. Credentials and cluster-administrator access are never exposed to the browser.',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/DatabaseId' },
					{ in: 'query', name: 'schema', schema: { type: 'string', maxLength: 128 } },
					{ in: 'query', name: 'table', schema: { type: 'string', maxLength: 128 } },
				],
				responses: {
					'200': { description: 'Tenant-visible objects and optional structure retrieved and audited.' },
					'400': { description: 'Invalid object selection.' },
					'404': { description: 'Database not found in the workspace.' },
					'502': { description: 'The isolated database endpoint could not be queried.' },
				},
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/explorer/advanced': {
			get: {
				summary: 'Browse views, routines, triggers, sequences, and events',
				operationId: 'browseWorkspaceDatabaseAdvancedObjects',
				description: 'Returns read-only definitions using the isolated logical-database credential and records an audit event.',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }],
				responses: {
					'200': { description: 'Programmable and supporting database objects retrieved.' },
					'404': { description: 'Database not found in the workspace.' },
					'502': { description: 'The isolated database endpoint could not be queried.' },
				},
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/explorer/schema': {
			post: {
				summary: 'Apply a modelled database schema change',
				operationId: 'mutateWorkspaceDatabaseSchema',
				description: 'Creates, renames, or removes PostgreSQL schemas and manages PostgreSQL/MySQL tables, columns, indexes, primary keys, and foreign keys. Arbitrary SQL is not accepted. Destructive operations require an impact acknowledgement and exact target confirmation. Every attempt is audited without storing SQL or credentials.',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['operation'],
								properties: {
									operation: { type: 'string', enum: ['create_schema', 'rename_schema', 'drop_schema', 'create_table', 'rename_table', 'drop_table', 'truncate_table', 'add_column', 'alter_column', 'drop_column', 'create_index', 'drop_index', 'add_primary_key', 'add_foreign_key', 'drop_constraint'] },
									schema: { type: 'string', minLength: 1, maxLength: 128 }, table: { type: 'string', minLength: 1, maxLength: 128 }, newName: { type: 'string', minLength: 1, maxLength: 128 },
									columnName: { type: 'string', minLength: 1, maxLength: 128 }, indexName: { type: 'string', minLength: 1, maxLength: 128 }, constraintName: { type: 'string', minLength: 1, maxLength: 128 },
									columns: { type: 'array', minItems: 1, maxItems: 100 }, column: { type: 'object' }, referenceSchema: { type: 'string' }, referenceTable: { type: 'string' }, referenceColumns: { type: 'array' },
									acceptedImpact: { type: 'boolean' }, confirmation: { type: 'string', maxLength: 300 }, unique: { type: 'boolean' }, onDelete: { type: 'string', enum: ['cascade', 'no_action', 'restrict', 'set_null'] }, onUpdate: { type: 'string', enum: ['cascade', 'no_action', 'restrict', 'set_null'] },
								},
							},
						},
					},
				},
				responses: {
					'200': { description: 'Schema change completed and audited.' },
					'400': { description: 'Strict JSON validation failed.' },
					'401': { description: 'Authentication is missing or expired.' },
					'404': { description: 'Database not found in the workspace.' },
					'422': { description: 'The engine rejected the modelled operation or destructive confirmation.' },
				},
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/explorer/query': {
			post: { summary: 'Execute one controlled SQL statement', operationId: 'queryWorkspaceDatabase', description: 'Runs one statement with a 15-second timeout and a 500-row maximum. Read statements use read-only transactions. Supported data changes require explicit change mode and the exact database name. DDL, privileges, session commands, filesystem access, and multiple statements are blocked. Audits retain only a fingerprint and execution metadata.', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['query', 'allowChanges', 'rowLimit'], properties: { query: { type: 'string', minLength: 1, maxLength: 100000 }, allowChanges: { type: 'boolean' }, confirmation: { type: 'string', maxLength: 255 }, rowLimit: { type: 'integer', minimum: 1, maximum: 500 } } } } } }, responses: { '200': { description: 'Bounded JSON-safe result and execution metadata.' }, '400': { description: 'Strict JSON validation failed.' }, '422': { description: 'Policy, confirmation, timeout, or execution failure.' } } },
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/import/upload': { post: { summary: 'Stage a native database import', operationId: 'stageWorkspaceDatabaseImport', description: 'Multipart file-only step returning a short-lived signed token bound to the user, workspace, and database.', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }], responses: { '201': { description: 'File staged and integrity fingerprinted.' }, '413': { description: 'Configured size limit exceeded.' }, '415': { description: 'Multipart upload required.' } } } },
		'/workspaces/{workspaceId}/databases/{databaseId}/import': { post: { summary: 'Run a staged native database import', operationId: 'importWorkspaceDatabase', description: 'Verifies the signed token, checksum, database ownership, and exact confirmation. The staged file is removed after every attempt.', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }], responses: { '200': { description: 'Native import completed and audited.' }, '400': { description: 'Confirmation or payload validation failed.' }, '500': { description: 'Native import failed.' } } } },
		'/workspaces/{workspaceId}/databases/{databaseId}/export': { get: { summary: 'Download a native database export', operationId: 'exportWorkspaceDatabase', description: 'Streams a PostgreSQL custom dump or MySQL SQL dump without retaining it as a backup.', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }], responses: { '200': { description: 'Native dump stream.' }, '500': { description: 'Native export failed.' } } } },
		'/workspaces/{workspaceId}/databases/{databaseId}/explorer/rows': {
			get: {
				summary: 'Read a bounded page of database rows',
				operationId: 'readWorkspaceDatabaseRows',
				description: 'Returns at most 100 rows with server-side pagination, sorting, filtering, an eight-second statement timeout, and an audit event.',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/DatabaseId' },
					{ in: 'query', name: 'schema', required: true, schema: { type: 'string', maxLength: 128 } },
					{ in: 'query', name: 'table', required: true, schema: { type: 'string', maxLength: 128 } },
					{ in: 'query', name: 'page', schema: { type: 'integer', minimum: 1, default: 1 } },
					{ in: 'query', name: 'pageSize', schema: { type: 'integer', minimum: 10, maximum: 100, default: 25 } },
					{ in: 'query', name: 'sortColumn', schema: { type: 'string', maxLength: 128 } },
					{ in: 'query', name: 'sortDirection', schema: { type: 'string', enum: ['asc', 'desc'], default: 'asc' } },
					{ in: 'query', name: 'searchColumn', schema: { type: 'string', maxLength: 128 } },
					{ in: 'query', name: 'search', schema: { type: 'string', maxLength: 500 } },
				],
				responses: {
					'200': { description: 'Paginated rows and safe column metadata.' },
					'400': { description: 'Invalid page, object, sort, or search selection.' },
					'404': { description: 'Database not found in the workspace.' },
					'502': { description: 'The isolated database endpoint could not be queried.' },
				},
			},
			post: {
				summary: 'Insert one table row',
				operationId: 'insertWorkspaceDatabaseRow',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }],
				requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['schema', 'table', 'values'], properties: { schema: { type: 'string' }, table: { type: 'string' }, values: { type: 'object', additionalProperties: true, maxProperties: 100 } } } } } },
				responses: { '201': { description: 'One row inserted and audited.' }, '422': { description: 'Table, columns, or values cannot be written.' } },
			},
			patch: {
				summary: 'Update one row by complete primary key',
				operationId: 'updateWorkspaceDatabaseRow',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }],
				requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['schema', 'table', 'key', 'values'], properties: { schema: { type: 'string' }, table: { type: 'string' }, key: { type: 'object', minProperties: 1, maxProperties: 100, additionalProperties: true }, values: { type: 'object', minProperties: 1, maxProperties: 100, additionalProperties: true } } } } } },
				responses: { '200': { description: 'Matching row updated and audited.' }, '422': { description: 'A complete primary key and writable values are required.' } },
			},
			delete: {
				summary: 'Delete up to 100 rows by complete primary keys',
				operationId: 'deleteWorkspaceDatabaseRows',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }],
				requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['schema', 'table', 'keys', 'acceptedImpact'], properties: { schema: { type: 'string' }, table: { type: 'string' }, keys: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', minProperties: 1, maxProperties: 100, additionalProperties: true } }, acceptedImpact: { type: 'boolean', enum: [true] } } } } } },
				responses: { '200': { description: 'Matching rows deleted in one transaction and audited.' }, '422': { description: 'Confirmation, primary keys, or table is invalid.' } },
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/access': {
			get: {
				summary: 'List database users and grants',
				operationId: 'listWorkspaceDatabaseAccess',
				description: 'Returns owner, active, revoked, and expiring grants plus reusable cluster users. Credentials are never included.',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }],
				responses: { '200': { description: 'Access records and cross-database impact counts.' }, '404': { description: 'Database not found.' } },
			},
			post: {
				summary: 'Grant a database user access',
				operationId: 'createWorkspaceDatabaseAccess',
				description: 'Creates a restricted cluster login or reuses an existing one, then applies read-only, read-write, or custom schema/table privileges. New credentials are returned once.',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }],
				requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['userMode', 'accessLevel', 'privileges', 'scopes'], properties: { userMode: { type: 'string', enum: ['new', 'existing'] }, databaseUserId: { type: 'string', format: 'uuid' }, username: { type: 'string' }, password: { type: 'string' }, accessLevel: { type: 'string', enum: ['read_only', 'read_write', 'custom'] }, privileges: { type: 'array', items: { type: 'string', enum: ['select', 'insert', 'update', 'delete'] } }, scopes: { type: 'array', items: { type: 'object', required: ['schema'], properties: { schema: { type: 'string' }, table: { type: 'string' } } } }, expiresAt: { type: 'string', format: 'date-time' } } } } } },
				responses: { '201': { description: 'Provider privileges and grant persisted.' }, '400': { description: 'Strict JSON validation failed.' }, '409': { description: 'Username or active grant already exists.' }, '422': { description: 'The database engine rejected the access change.' } },
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/access/{grantId}': {
			patch: {
				summary: 'Update a database grant',
				operationId: 'updateWorkspaceDatabaseAccess',
				description: 'Replaces a non-owner grant at the database engine before persisting the new privilege and expiry settings.',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }, { in: 'path', name: 'grantId', required: true, schema: { type: 'string', format: 'uuid' } }],
				responses: { '200': { description: 'Grant updated and audited.' }, '404': { description: 'Grant not found.' }, '422': { description: 'Owner grants cannot be edited.' } },
			},
			delete: {
				summary: 'Revoke a database grant',
				operationId: 'revokeWorkspaceDatabaseAccess',
				description: 'Revokes a non-owner grant after exact username confirmation and records the reason.',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }, { in: 'path', name: 'grantId', required: true, schema: { type: 'string', format: 'uuid' } }],
				requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['confirmation', 'reason'], properties: { confirmation: { type: 'string' }, reason: { type: 'string', minLength: 3, maxLength: 500 } } } } } },
				responses: { '200': { description: 'Grant revoked and audited.' }, '400': { description: 'Username confirmation failed.' }, '422': { description: 'Owner grants cannot be revoked.' } },
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/users/{databaseUserId}/action': {
			post: {
				summary: 'Manage a reusable database user',
				operationId: 'manageWorkspaceDatabaseUser',
				description: 'Reveals or rotates credentials, suspends/restores login, or deletes an unreferenced user after exact username and impact confirmation. Cluster-wide actions report every affected database.',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }, { in: 'path', name: 'databaseUserId', required: true, schema: { type: 'string', format: 'uuid' } }],
				requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['action', 'acceptedImpact', 'confirmation'], properties: { action: { type: 'string', enum: ['reveal', 'rotate', 'suspend', 'restore', 'delete'] }, acceptedImpact: { type: 'boolean', enum: [true] }, confirmation: { type: 'string' }, password: { type: 'string' }, reason: { type: 'string', minLength: 3, maxLength: 500 } } } } } },
				responses: { '200': { description: 'User action completed and audited.' }, '400': { description: 'Username confirmation failed.' }, '422': { description: 'Deletion is blocked while ownership or active grants remain.' } },
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/backups': {
			get: {
				summary: 'List encrypted logical database backups',
				operationId: 'listDatabaseBackups',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/DatabaseId' },
				],
				responses: {
					'200': { description: 'Workspace-scoped backup history.' },
					'404': { description: 'Database not found.' },
				},
			},
			post: {
				summary: 'Create an encrypted logical database backup',
				operationId: 'createDatabaseBackup',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/DatabaseId' },
				],
				responses: {
					'201': {
						description: 'Native dump encrypted, checksummed, and retained.',
					},
					'422': {
						description:
							'Backups are not included in the workspace entitlement.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/backups/{backupId}': {
			delete: {
				summary: 'Delete a logical database backup',
				operationId: 'deleteDatabaseBackup',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/DatabaseId' },
					{ $ref: '#/components/parameters/BackupId' },
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['confirmationName'],
								properties: {
									confirmationName: {
										type: 'string',
										example: 'backup-1234abcd',
									},
									acceptedImpact: { type: 'boolean' },
									connectedResourceNames: {
										type: 'array',
										items: { type: 'string' },
									},
								},
							},
						},
					},
				},
				responses: {
					'200': { description: 'Artifact removed and record soft-deleted.' },
					'404': { description: 'Backup not found.' },
				},
			},
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/backups/{backupId}/restore':
			{
				post: {
					summary: 'Restore and overwrite a logical database from backup',
					operationId: 'restoreDatabaseBackup',
					security: [{ bearerAuth: [] }],
					parameters: [
						{ $ref: '#/components/parameters/WorkspaceId' },
						{ $ref: '#/components/parameters/DatabaseId' },
						{ $ref: '#/components/parameters/BackupId' },
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['confirmation'],
									properties: {
										confirmation: {
											type: 'string',
											description: 'Exact logical database name.',
										},
									},
								},
							},
						},
					},
					responses: {
						'200': { description: 'Checksum verified and database restored.' },
						'400': { description: 'Exact database-name confirmation failed.' },
						'404': { description: 'Backup not found.' },
					},
				},
			},
		'/workspaces/{workspaceId}/databases/{databaseId}/backups/{backupId}/download':
			{
				get: {
					summary: 'Download a decrypted native database dump',
					operationId: 'downloadDatabaseBackup',
					security: [{ bearerAuth: [] }],
					parameters: [
						{ $ref: '#/components/parameters/WorkspaceId' },
						{ $ref: '#/components/parameters/DatabaseId' },
						{ $ref: '#/components/parameters/BackupId' },
					],
					responses: {
						'200': {
							description:
								'Audited attachment stream after checksum verification.',
						},
						'404': { description: 'Backup not found.' },
					},
				},
			},
		'/workspaces/{workspaceId}/databases/{databaseId}/backups/schedule': {
			get: { summary: 'Read the automatic backup policy', operationId: 'showDatabaseBackupSchedule', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }], responses: { '200': { description: 'Current schedule or null.' } } },
			post: { summary: 'Create or update the automatic backup policy', operationId: 'saveDatabaseBackupSchedule', description: 'Schedules encrypted logical exports. Retention cannot exceed the active package entitlement.', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['frequencyHours', 'retentionDays', 'isEnabled'], properties: { frequencyHours: { type: 'integer', minimum: 1, maximum: 8760 }, retentionDays: { type: 'integer', minimum: 1, maximum: 3650 }, isEnabled: { type: 'boolean' } } } } } }, responses: { '200': { description: 'Schedule updated.' }, '201': { description: 'Schedule created.' }, '422': { description: 'Package backup or retention policy rejected.' } } },
			delete: { summary: 'Remove the automatic backup policy', operationId: 'deleteDatabaseBackupSchedule', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }], responses: { '200': { description: 'Schedule disabled and soft-deleted.' } } },
		},
		'/workspaces/{workspaceId}/databases/{databaseId}/backups/{backupId}/verify': { post: { summary: 'Verify a backup artifact', operationId: 'verifyDatabaseBackup', description: 'Fetches the complete local or off-site artifact, checks its SHA-256 checksum, authenticates AES-GCM, and decrypts it without touching a database.', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }, { $ref: '#/components/parameters/BackupId' }], responses: { '200': { description: 'Integrity evidence recorded.' }, '500': { description: 'Artifact retrieval, checksum, authentication, or decryption failed.' } } } },
		'/workspaces/{workspaceId}/databases/{databaseId}/backups/{backupId}/clone': { post: { summary: 'Clone a backup into another database', operationId: 'cloneDatabaseBackup', description: 'Restores into another active database in the same workspace and engine after exact target-name confirmation.', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/DatabaseId' }, { $ref: '#/components/parameters/BackupId' }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['targetDatabaseId', 'confirmation'], properties: { targetDatabaseId: { type: 'string', format: 'uuid' }, confirmation: { type: 'string' } } } } } }, responses: { '200': { description: 'Backup cloned and audited.' }, '400': { description: 'Target confirmation failed.' }, '422': { description: 'Target engine differs from source.' } } } },
		'/workspaces/{workspaceId}/applications': {
			get: {
				summary: 'List workspace source applications',
				operationId: 'listWorkspaceApplications',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': {
						description: 'Application configuration and deployment state.',
					},
				},
			},
			post: {
				summary:
					'Queue a public Git application deployment with non-blocking custom domains',
				operationId: 'createWorkspaceApplication',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['name', 'runtimeCode', 'repository', 'port'],
								properties: {
									name: { type: 'string' },
									runtimeCode: { type: 'string' },
									repository: { type: 'string', format: 'uri' },
									port: { type: 'integer' },
									subdomain: { type: 'string' },
									domains: {
										type: 'array',
										maxItems: 20,
										items: { type: 'string', format: 'hostname' },
										description:
											'Custom hostnames stored as pending even when public DNS is not ready.',
									},
								},
							},
						},
					},
				},
				responses: {
					'202': {
						description:
							'Application, platform hostname, pending custom domains, and deployment job persisted.',
					},
					'409': { description: 'Requested domain conflicts.' },
					'422': { description: 'Application entitlement exhausted.' },
				},
			},
		},
		'/workspaces/{workspaceId}/domains': {
			get: {
				summary:
					'List all workspace domains with connected applications and TLS state',
				operationId: 'listWorkspaceDomains',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': {
						description: 'Workspace-scoped platform and custom domains.',
					},
					'404': { description: 'Workspace not found.' },
				},
			},
			post: {
				summary:
					'Check hostname availability, ownership policy, and current public DNS records',
				operationId: 'checkWorkspaceDomain',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['hostname'],
								properties: {
									hostname: { type: 'string', format: 'hostname' },
									purpose: {
										type: 'string',
										enum: ['attach', 'ownership'],
										default: 'attach',
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description:
							'Availability, owner-approval requirement, and current CNAME, A, and AAAA visibility. Missing DNS does not block application creation.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/domain-ownership': {
			get: {
				summary:
					'List owned domain scopes and incoming or outgoing access requests',
				operationId: 'listWorkspaceDomainOwnership',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': {
						description:
							'Ownership scopes and approval queues visible to the workspace member.',
					},
					'404': { description: 'Workspace not found.' },
				},
			},
			post: {
				summary: 'Register a root domain ownership claim for a workspace',
				operationId: 'registerWorkspaceDomainOwnership',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['hostname'],
								properties: {
									hostname: {
										type: 'string',
										format: 'hostname',
										example: 'example.com',
									},
								},
							},
						},
					},
				},
				responses: {
					'201': {
						description:
							'Root-domain ownership claim created and audit logged.',
					},
					'400': { description: 'Hostname is not a registrable root domain.' },
					'403': { description: 'Domain belongs to another workspace.' },
					'409': { description: 'Domain is already registered.' },
				},
			},
		},
		'/workspaces/{workspaceId}/domain-access/{requestId}': {
			post: {
				summary:
					'Approve, reject, or revoke a protected-subdomain access request',
				operationId: 'respondToDomainAccessRequest',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{
						name: 'requestId',
						in: 'path',
						required: true,
						schema: { type: 'string', format: 'uuid' },
					},
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['action'],
								properties: {
									action: {
										type: 'string',
										enum: ['approve', 'reject', 'revoke'],
									},
								},
							},
						},
					},
				},
				responses: {
					'200': {
						description:
							'Owner decision applied and routing synchronized when necessary.',
					},
					'403': {
						description: 'Only the owning workspace Owner may respond.',
					},
					'422': {
						description:
							'Request state does not allow the requested transition.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/applications/{applicationId}': {
			post: {
				summary: 'Update application configuration and queue deployment',
				operationId: 'updateWorkspaceApplication',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				responses: {
					'202': {
						description:
							'Configuration stored and a fresh provider deployment queued.',
					},
					'404': { description: 'Application or selected database not found.' },
					'422': { description: 'Application configuration is invalid.' },
				},
			},
			delete: {
				summary:
					'Delete an application and optionally selected exclusive databases',
				operationId: 'deleteWorkspaceApplication',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				responses: {
					'200': {
						description:
							'Provider resource removed and local records soft-deleted.',
					},
					'422': {
						description:
							'Typed confirmations or database dependencies do not match.',
					},
					'502': {
						description:
							'Provider cleanup failed; application is marked cleanup_failed.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/applications/{applicationId}/action': {
			post: {
				summary:
					'Start, pause, restart, redeploy, deactivate, or reactivate an application',
				operationId: 'controlWorkspaceApplication',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				responses: {
					'202': {
						description: 'Provider lifecycle action accepted and audited.',
					},
					'403': { description: 'Application is administrator-suspended.' },
					'422': {
						description: 'Manual deployments are not included in the package.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/applications/{applicationId}/deployments': {
			get: {
				summary: 'List deployment history, diagnostics, and categorized build output',
				operationId: 'listWorkspaceApplicationDeployments',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				responses: {
					'200': {
						description:
							'History includes effective retention limits, failure ownership, actionable source evidence, categorized build/deployment logs, and the complete raw provider output.',
					},
					'404': { description: 'Application not found.' },
				},
			},
		},
		'/workspaces/{workspaceId}/applications/{applicationId}/settings': {
			get: {
				summary: 'Retrieve application release, error, upload, and site-state settings',
				operationId: 'getWorkspaceApplicationSettings',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/ApplicationId' }],
				responses: {
					'200': { description: 'Framework-aware settings, effective site state, and custom-page package availability.' },
					'404': { description: 'Application not found.' },
				},
			},
			post: {
				summary: 'Update application release, error, upload, and site-state settings',
				operationId: 'updateWorkspaceApplicationSettings',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { $ref: '#/components/parameters/ApplicationId' }],
				requestBody: {
					required: true,
					content: { 'application/json': { schema: {
						type: 'object',
						additionalProperties: false,
						required: ['migrateOnDeploy', 'migrationCommand', 'migrationTimeoutSeconds', 'runSeederOnDeploy', 'seederCommand', 'seederTimeoutSeconds', 'maintenanceDuringDeployment', 'maintenanceEnabled', 'maintenanceExpiresAt', 'comingSoonEnabled', 'comingSoonExpiresAt', 'returnErrors', 'publicErrorMode', 'uploadMaxFileSizeMb', 'uploadMaxRequestSizeMb', 'uploadTimeoutSeconds', 'uploadAllowedExtensions', 'uploadAllowedMimeTypes'],
						properties: {
							migrateOnDeploy: { type: 'boolean' }, migrationCommand: { type: ['string', 'null'], maxLength: 500 }, migrationTimeoutSeconds: { type: 'integer', minimum: 30, maximum: 3600 },
							runSeederOnDeploy: { type: 'boolean' }, seederCommand: { type: ['string', 'null'], maxLength: 500 }, seederTimeoutSeconds: { type: 'integer', minimum: 30, maximum: 3600 },
							maintenanceDuringDeployment: { type: 'boolean' }, maintenanceEnabled: { type: 'boolean' }, maintenanceExpiresAt: { type: ['string', 'null'], format: 'date-time' }, comingSoonEnabled: { type: 'boolean' }, comingSoonExpiresAt: { type: ['string', 'null'], format: 'date-time' },
							returnErrors: { type: 'boolean' }, publicErrorMode: { type: 'string', enum: ['generic', 'message', 'detailed'] },
							uploadMaxFileSizeMb: { type: 'integer', minimum: 1, maximum: 10240 }, uploadMaxRequestSizeMb: { type: 'integer', minimum: 1, maximum: 20480 }, uploadTimeoutSeconds: { type: 'integer', minimum: 30, maximum: 3600 }, uploadAllowedExtensions: { type: 'array', items: { type: 'string' }, maxItems: 100 }, uploadAllowedMimeTypes: { type: 'array', items: { type: 'string' }, maxItems: 100 },
						},
					} } },
				},
				responses: { '200': { description: 'Settings saved, provider release hook synchronized, and audit event recorded.' }, '400': { description: 'Validation failed.' }, '422': { description: 'Settings or provider synchronization failed.' } },
			},
		},
		'/workspaces/{workspaceId}/applications/{applicationId}/events': {
			get: {
				summary: 'Stream live application and deployment events',
				operationId: 'streamWorkspaceApplicationEvents',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				responses: {
					'200': {
						description:
							'Authenticated text/event-stream with status and deployment events.',
					},
					'403': { description: 'Workspace access denied.' },
				},
			},
		},
		'/workspaces/{workspaceId}/applications/options': {
			get: {
				summary:
					'List deployment runtimes, databases, limits, and reusable workspace domains',
				operationId: 'workspaceApplicationOptions',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': {
						description:
							'Active runtime, database, entitlement, and owned-domain options including attached hostnames.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/applications/github-connections': {
			get: {
				summary: 'List active workspace GitHub installations',
				operationId: 'listWorkspaceGithubConnections',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: { '200': { description: 'Independent active GitHub installations available to this workspace.' } },
			},
			post: {
				summary: 'Start another GitHub installation flow',
				operationId: 'connectWorkspaceGithubAccount',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: { '200': { description: 'Signed GitHub installation URL generated.' } },
			},
		},
		'/workspaces/{workspaceId}/applications/github-connections/reconcile': {
			post: {
				summary: 'Reconcile installed GitHub accounts after access changes',
				operationId: 'reconcileWorkspaceGithubConnections',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': { description: 'Active installations refreshed; removed installations deactivated and audit logged.' },
					'502': { description: 'GitHub installation state could not be verified.' },
				},
			},
		},
		'/workspaces/{workspaceId}/applications/github-connections/{connectionId}': {
			delete: {
				summary: 'Deactivate one workspace GitHub installation',
				operationId: 'deactivateWorkspaceGithubConnection',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { in: 'path', name: 'connectionId', required: true, schema: { type: 'string', format: 'uuid' } }],
				requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: false, required: ['acceptedImpact'], properties: { acceptedImpact: { type: 'boolean', enum: [true] } } } } } },
				responses: { '200': { description: 'Connection deactivated and audit logged.' }, '404': { description: 'Active connection not found in the workspace.' } },
			},
		},
		'/workspaces/{workspaceId}/applications/github-connections/{connectionId}/repositories': {
			get: {
				summary: 'List every repository granted to a GitHub installation',
				operationId: 'listWorkspaceGithubRepositories',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }, { in: 'path', name: 'connectionId', required: true, schema: { type: 'string', format: 'uuid' } }],
				responses: {
					'200': { description: 'All accessible repositories returned using GitHub pagination.' },
					'404': { description: 'Active connection not found in the workspace.' },
					'502': { description: 'GitHub repository access could not be loaded.' },
				},
			},
		},
		'/workspaces/{workspaceId}/applications/{applicationId}/logs': {
			get: {
				summary: 'Read live runtime stdout and stderr',
				operationId: 'workspaceApplicationLogs',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				responses: {
					'200': {
						description:
							'Runtime logs, falling back to latest deployment logs when the application is not running.',
					},
					'404': { description: 'Application not found in workspace.' },
				},
			},
		},
		'/workspaces/{workspaceId}/applications/{applicationId}/cron-jobs': {
			get: {
				summary: 'List project scheduled tasks and plan limits',
				operationId: 'listApplicationCronJobs',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				responses: {
					'200': {
						description: 'Tasks, framework preset, and effective limits.',
					},
					'404': { description: 'Application not found.' },
				},
			},
			post: {
				summary: 'Create and synchronize a project scheduled task',
				operationId: 'createApplicationCronJob',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								required: ['name', 'frequency', 'timeoutSeconds', 'isEnabled'],
								properties: {
									name: { type: 'string' },
									command: { type: 'string' },
									frequency: { type: 'string', example: '0 */4 * * *' },
									timeoutSeconds: { type: 'integer' },
									isEnabled: { type: 'boolean' },
								},
							},
						},
					},
				},
				responses: {
					'201': { description: 'Task synchronized and stored.' },
					'422': {
						description:
							'Plan, framework, schedule, or provider constraint failed.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/applications/{applicationId}/cron-jobs/{cronId}':
			{
				patch: {
					summary: 'Update a project scheduled task',
					operationId: 'updateApplicationCronJob',
					security: [{ bearerAuth: [] }],
					responses: {
						'200': { description: 'Task synchronized and updated.' },
						'422': { description: 'Update rejected.' },
					},
				},
				delete: {
					summary: 'Delete a project scheduled task',
					operationId: 'deleteApplicationCronJob',
					security: [{ bearerAuth: [] }],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['confirmationName'],
									properties: {
										confirmationName: { type: 'string' },
										acceptedImpact: { type: 'boolean' },
										connectedResourceNames: {
											type: 'array',
											items: { type: 'string' },
										},
									},
								},
							},
						},
					},
					responses: {
						'200': {
							description:
								'Provider task removed and local record soft-deleted.',
						},
						'422': {
							description: 'Deletion confirmation or provider cleanup failed.',
						},
					},
				},
			},
		'/workspaces/{workspaceId}/applications/{applicationId}/cron-jobs/{cronId}/executions':
			{
				get: {
					summary: 'Read provider scheduled-task execution history',
					operationId: 'listApplicationCronExecutions',
					security: [{ bearerAuth: [] }],
					responses: {
						'200': { description: 'Sanitized provider execution history.' },
						'404': { description: 'Task is unavailable or unsynchronized.' },
					},
				},
			},
		'/workspaces/{workspaceId}/applications/{applicationId}/domains': {
			get: {
				summary: 'List application domains and TLS state',
				operationId: 'listApplicationDomains',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				responses: {
					'200': { description: 'Active platform and custom domain records.' },
					'404': { description: 'Application not found.' },
				},
			},
			post: {
				summary: 'Register a custom domain for verification or owner approval',
				operationId: 'createApplicationDomain',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{ $ref: '#/components/parameters/ApplicationId' },
				],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								additionalProperties: false,
								required: ['hostname'],
								properties: {
									hostname: { type: 'string', format: 'hostname' },
								},
							},
						},
					},
				},
				responses: {
					'201': {
						description:
							'Domain attached immediately, queued for TXT verification, or submitted to the verified parent-domain owner.',
					},
					'409': { description: 'Hostname is already assigned.' },
				},
			},
		},
		'/workspaces/{workspaceId}/applications/{applicationId}/domains/{domainId}':
			{
				post: {
					summary: 'Change primary/platform state or refresh TLS state',
					operationId: 'updateApplicationDomain',
					security: [{ bearerAuth: [] }],
					parameters: [
						{ $ref: '#/components/parameters/WorkspaceId' },
						{ $ref: '#/components/parameters/ApplicationId' },
						{ $ref: '#/components/parameters/DomainId' },
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									additionalProperties: false,
									required: ['action'],
									properties: {
										action: {
											type: 'string',
											enum: ['set_primary', 'toggle_platform', 'refresh_tls'],
										},
										enabled: { type: 'boolean' },
									},
								},
							},
						},
					},
					responses: {
						'200': { description: 'Domain state updated.' },
						'422': { description: 'Unsafe or invalid domain transition.' },
					},
				},
				delete: {
					summary: 'Detach and soft-delete a saved domain',
					operationId: 'deleteApplicationDomain',
					security: [{ bearerAuth: [] }],
					parameters: [
						{ $ref: '#/components/parameters/WorkspaceId' },
						{ $ref: '#/components/parameters/ApplicationId' },
						{ $ref: '#/components/parameters/DomainId' },
					],
					requestBody: {
						required: true,
						content: {
							'application/json': {
								schema: {
									type: 'object',
									required: ['confirmationName'],
									properties: {
										confirmationName: { type: 'string' },
										acceptedImpact: { type: 'boolean' },
										connectedResourceNames: {
											type: 'array',
											items: { type: 'string' },
										},
									},
								},
							},
						},
					},
					responses: {
						'200': { description: 'Domain detached and soft-deleted.' },
						'422': {
							description:
								'No verified enabled replacement exists for the platform or primary domain.',
						},
					},
				},
			},
		'/workspaces/{workspaceId}/applications/{applicationId}/domains/{domainId}/verify':
			{
				post: {
					summary: 'Verify DNS ownership and attach a custom domain',
					operationId: 'verifyApplicationDomain',
					security: [{ bearerAuth: [] }],
					parameters: [
						{ $ref: '#/components/parameters/WorkspaceId' },
						{ $ref: '#/components/parameters/ApplicationId' },
						{ $ref: '#/components/parameters/DomainId' },
					],
					responses: {
						'200': {
							description:
								'TXT ownership verified, provider synchronized, and TLS provisioning started.',
						},
						'403': {
							description:
								'A different workspace owns the verified parent domain; owner approval is required.',
						},
						'422': { description: 'Verification TXT record was not found.' },
						'502': {
							description:
								'Provider synchronization failed without enabling the domain locally.',
						},
					},
				},
			},
		'/workspaces/{workspaceId}/convert': {
			post: {
				summary:
					'Convert a personal workspace to an organisation without changing identity',
				operationId: 'convertWorkspace',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': { description: 'Workspace converted and audited.' },
					'422': {
						description:
							'Caller is not the active owner or conversion is invalid.',
					},
				},
			},
		},
		'/workspaces/{workspaceId}/billing-profiles': {
			get: {
				summary: 'List immutable workspace billing profile versions',
				operationId: 'listWorkspaceBillingProfiles',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: { '200': { description: 'Newest profile versions first.' } },
			},
			post: {
				summary:
					'Create or authoritatively clone an immutable billing profile version',
				operationId: 'createWorkspaceBillingProfile',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'201': {
						description:
							'Immutable profile version created with optional source lineage.',
					},
					'422': { description: 'Validation or authorization failed.' },
				},
			},
		},
		'/workspaces/{workspaceId}/ownership-transfer': {
			post: {
				summary:
					'Request an audited ownership transfer requiring recipient confirmation',
				operationId: 'requestWorkspaceOwnershipTransfer',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'202': { description: 'Transfer pending for seven days.' },
					'422': { description: 'Recipient or ownership validation failed.' },
				},
			},
		},
		'/ownership-transfers': {
			get: {
				summary:
					'List ownership transfers addressed to the authenticated customer',
				operationId: 'listIncomingOwnershipTransfers',
				security: [{ bearerAuth: [] }],
				responses: { '200': { description: 'Incoming transfer history.' } },
			},
		},
		'/ownership-transfers/{transferId}/respond': {
			post: {
				summary: 'Accept or decline a pending ownership transfer',
				operationId: 'respondToWorkspaceOwnershipTransfer',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Transfer response applied; a replacement personal workspace is created for the sender when required.',
					},
					'422': { description: 'Transfer is invalid or expired.' },
				},
			},
		},
		'/workspaces/{workspaceId}/subscription/cancellation': {
			post: {
				summary:
					'Schedule or reverse primary subscription cancellation at term end',
				operationId: 'scheduleSubscriptionCancellation',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': { description: 'Cancellation schedule updated and audited.' },
					'404': { description: 'Active primary subscription not found.' },
				},
			},
		},
		'/operations/customer-workspaces': {
			get: {
				summary: 'Administer customers, workspaces, and primary subscriptions',
				operationId: 'listCustomerWorkspacesForAdministration',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description: 'Workspace ownership and subscription summaries.',
					},
					'403': { description: 'subscriptions.view permission required.' },
				},
			},
		},
		'/operations/users': {
			get: {
				summary: 'List users for customer resource administration',
				operationId: 'listAdminControlledUsers',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Audited user inventory.' },
					'403': { description: 'Missing customers.view permission.' },
				},
			},
		},
		'/operations/users/{userId}': {
			get: {
				summary:
					'Read one user, workspaces, sessions and authentication events',
				operationId: 'showAdminControlledUser',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description: 'Permission-filtered and audited user control record.',
					},
					'403': { description: 'Permission denied.' },
					'404': { description: 'User not found.' },
				},
			},
		},
		'/operations/users/{userId}/workspaces/{workspaceId}': {
			get: {
				summary: 'Read workspace applications and related customer resources',
				operationId: 'showAdminControlledWorkspace',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Permission-filtered, audited workspace resource inventory.',
					},
					'404': { description: 'Workspace is not associated with this user.' },
				},
			},
		},
		'/operations/users/{userId}/sessions/{sessionId}': {
			post: {
				summary: 'Revoke a customer session',
				operationId: 'revokeAdminControlledUserSession',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Session revoked and audited.' },
					'403': { description: 'Missing user_sessions.revoke permission.' },
				},
			},
		},
		'/operations/users/{userId}/workspaces/{workspaceId}/applications/{applicationId}/files':
			{
				get: {
					summary: 'List an application repository tree',
					operationId: 'listAdminApplicationFiles',
					security: [{ bearerAuth: [] }],
					responses: {
						'200': { description: 'Bounded repository tree; access audited.' },
						'403': { description: 'Permission or repository access denied.' },
					},
				},
				post: {
					summary: 'Read an application source file',
					operationId: 'readAdminApplicationFile',
					security: [{ bearerAuth: [] }],
					responses: {
						'200': {
							description:
								'Bounded UTF-8 file preview; access audited without contents.',
						},
						'403': {
							description: 'Missing normal or sensitive file permission.',
						},
					},
				},
			},
		'/operations/users/{userId}/workspaces/{workspaceId}/applications/{applicationId}/control':
			{
				post: {
					summary: 'Start, stop, restart, or redeploy a customer application',
					operationId: 'controlAdminCustomerApplication',
					security: [{ bearerAuth: [] }],
					responses: {
						'202': {
							description: 'Provider lifecycle action accepted and audited.',
						},
						'403': { description: 'Missing action-specific permission.' },
						'404': {
							description:
								'Application is not associated with the selected customer workspace.',
						},
						'502': {
							description: 'Hosting provider rejected the lifecycle request.',
						},
					},
				},
			},
		'/operations/platform-settings': {
			get: {
				summary: 'Retrieve platform domain and managed-traffic settings',
				operationId: 'showPlatformSettings',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Configured platform URLs, ownership-verification policy, and the managed-traffic Beta switch.',
					},
					'403': { description: 'Permission denied.' },
				},
			},
			post: {
				summary:
					'Update platform domain, ownership-verification, and managed-traffic settings',
				operationId: 'updatePlatformSettings',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Platform URL, domain ownership, and managed-traffic configuration updated.',
					},
					'422': { description: 'Invalid or unsafe configuration.' },
				},
			},
		},
		'/operations/platform-settings/verify': {
			post: {
				summary: 'Verify configured platform DNS and HTTPS',
				operationId: 'verifyPlatformSettings',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'DNS and HTTPS observations recorded.' },
					'422': { description: 'Configuration is incomplete or unreachable.' },
				},
			},
		},
		'/operations/platform-settings/dns-providers': {
			get: {
				summary: 'List masked DNS provider connections',
				operationId: 'listDnsProviderConnections',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': {
						description:
							'Masked connection metadata. Secret tokens are never returned.',
					},
					'403': { description: 'Permission denied.' },
				},
			},
		},
		'/operations/platform-settings/dns-providers/{provider}': {
			parameters: [
				{
					in: 'path',
					name: 'provider',
					required: true,
					schema: {
						enum: ['cloudflare', 'godaddy', 'hostinger'],
						type: 'string',
					},
				},
			],
			post: {
				summary: 'Create or rotate an encrypted DNS provider connection',
				operationId: 'saveDnsProviderConnection',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									accountIdentifier: { type: ['string', 'null'] },
									token: { minLength: 8, type: 'string', writeOnly: true },
								},
							},
						},
					},
				},
				responses: {
					'200': { description: 'Connection saved.' },
					'422': { description: 'Invalid connection details.' },
				},
			},
			delete: {
				summary: 'Remove a DNS provider connection',
				operationId: 'removeDnsProviderConnection',
				security: [{ bearerAuth: [] }],
				responses: { '200': { description: 'Connection removed.' } },
			},
		},
		'/operations/platform-settings/dns-providers/{provider}/validate': {
			parameters: [
				{
					in: 'path',
					name: 'provider',
					required: true,
					schema: {
						enum: ['cloudflare', 'godaddy', 'hostinger'],
						type: 'string',
					},
				},
			],
			post: {
				summary: 'Validate a stored DNS provider connection',
				operationId: 'validateDnsProviderConnection',
				security: [{ bearerAuth: [] }],
				responses: {
					'200': { description: 'Provider accepted the credentials.' },
					'502': {
						description:
							'Provider rejected or could not validate the credentials.',
					},
				},
			},
		},
		'/operations/customer-workspaces/{workspaceId}': {
			get: {
				summary: 'Inspect one customer workspace, subscription, and add-ons',
				operationId: 'showCustomerWorkspaceForAdministration',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': { description: 'Customer workspace administration detail.' },
					'404': { description: 'Workspace not found.' },
				},
			},
		},
		'/operations/customer-workspaces/{workspaceId}/subscription': {
			post: {
				summary: 'Change a primary subscription lifecycle state',
				operationId: 'administerSubscriptionLifecycle',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': { description: 'Subscription state updated and audited.' },
					'403': { description: 'subscriptions.update permission required.' },
					'404': { description: 'Primary subscription not found.' },
				},
			},
		},
		'/operations/customer-workspaces/{workspaceId}/add-ons': {
			post: {
				summary: 'Attach an immutable commercial add-on snapshot',
				operationId: 'createSubscriptionAddOn',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'201': { description: 'Add-on created and audited.' },
					'422': {
						description: 'Validation or active-item uniqueness failed.',
					},
				},
			},
		},
		'/operations/customer-workspaces/{workspaceId}/add-ons/{itemId}': {
			post: {
				summary: 'Cancel an active subscription add-on',
				operationId: 'cancelSubscriptionAddOn',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': { description: 'Add-on cancelled and audited.' },
					'404': { description: 'Active add-on not found.' },
				},
			},
		},
		'/workspaces/{workspaceId}/usage': {
			get: {
				summary:
					'View effective limits, current usage, pending reservations, and observation freshness',
				operationId: 'showWorkspaceUsage',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': {
						description:
							'Customer-visible usage with stale observations identified.',
					},
					'404': { description: 'Workspace or active subscription not found.' },
				},
			},
		},
		'/operations/customer-workspaces/{workspaceId}/usage': {
			get: {
				summary:
					'Inspect workspace usage, restrictions, observations, and override history',
				operationId: 'administerWorkspaceUsage',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/WorkspaceId' }],
				responses: {
					'200': {
						description: 'Effective usage and complete override history.',
					},
					'403': { description: 'usage.view permission required.' },
				},
			},
			post: {
				summary:
					'Create an entitlement override or record a measured usage observation',
				operationId: 'createWorkspaceUsageControl',
				security: [{ bearerAuth: [] }],
				parameters: [
					{ $ref: '#/components/parameters/WorkspaceId' },
					{
						name: 'action',
						in: 'query',
						required: false,
						schema: {
							type: 'string',
							enum: ['override', 'observe'],
							default: 'override',
						},
					},
				],
				responses: {
					'201': {
						description: 'Audited override or timestamped observation created.',
					},
					'403': { description: 'usage.update permission required.' },
					'422': { description: 'Strict validation failed.' },
				},
			},
		},
		'/operations/customer-workspaces/{workspaceId}/usage/overrides/{overrideId}':
			{
				post: {
					summary: 'Revoke an active workspace entitlement override',
					operationId: 'revokeWorkspaceUsageOverride',
					security: [{ bearerAuth: [] }],
					parameters: [
						{ $ref: '#/components/parameters/WorkspaceId' },
						{
							name: 'overrideId',
							in: 'path',
							required: true,
							schema: { type: 'string', format: 'uuid' },
						},
					],
					responses: {
						'200': { description: 'Override revoked and audited.' },
						'404': { description: 'Active override not found.' },
					},
				},
			},
	},
	components: {
		parameters: {
			WorkspaceId: {
				name: 'workspaceId',
				in: 'path',
				required: true,
				description: 'Six-digit workspace identifier.',
				schema: { type: 'integer', minimum: 100000, maximum: 999999 },
			},
			DatabaseId: {
				name: 'databaseId',
				in: 'path',
				required: true,
				description: 'Logical database UUID.',
				schema: { type: 'string', format: 'uuid' },
			},
			BackupId: {
				name: 'backupId',
				in: 'path',
				required: true,
				description: 'Database backup UUID.',
				schema: { type: 'string', format: 'uuid' },
			},
			ApplicationId: {
				name: 'applicationId',
				in: 'path',
				required: true,
				description: 'Application build UUID.',
				schema: { type: 'string', format: 'uuid' },
			},
			DomainId: {
				name: 'domainId',
				in: 'path',
				required: true,
				description: 'Application domain UUID.',
				schema: { type: 'string', format: 'uuid' },
			},
			ClusterCode: {
				name: 'clusterCode',
				in: 'path',
				required: true,
				description: 'Human-readable database cluster code.',
				schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
			},
			PackageSlug: {
				name: 'packageSlug',
				in: 'path',
				required: true,
				description: 'Human-readable package slug.',
				schema: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
			},
			AdminId: {
				name: 'adminId',
				in: 'path',
				required: true,
				description: 'Six-digit public administrator ID.',
				schema: {
					type: 'integer',
					minimum: 100000,
					maximum: 999999,
					example: 123456,
				},
			},
			SessionId: {
				name: 'sessionId',
				in: 'path',
				required: true,
				schema: { type: 'string', format: 'uuid' },
			},
		},
		securitySchemes: {
			bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
		},
		schemas: {
			PackagePricesInput: {
				type: 'object',
				additionalProperties: false,
				required: [
					'currency',
					'monthlyAmount',
					'yearlyAmount',
					'twoYearAmount',
					'threeYearAmount',
					'taxBehavior',
					'isPublic',
				],
				properties: {
					currency: { type: 'string', enum: ['INR'] },
					monthlyAmount: { type: 'number', exclusiveMinimum: 0 },
					yearlyAmount: { type: 'number', exclusiveMinimum: 0 },
					twoYearAmount: { type: 'number', exclusiveMinimum: 0 },
					threeYearAmount: { type: 'number', exclusiveMinimum: 0 },
					taxBehavior: { type: 'string', enum: ['exclusive', 'inclusive'] },
					isPublic: { type: 'boolean' },
				},
			},
			PackageCostReviewInput: {
				type: 'object',
				additionalProperties: false,
				required: ['estimatedMonthlyCost', 'revenue', 'status', 'notes'],
				properties: {
					estimatedMonthlyCost: { type: 'number', minimum: 0 },
					revenue: { type: 'number', exclusiveMinimum: 0 },
					status: { type: 'string', enum: ['approved', 'pending', 'rejected'] },
					notes: { type: 'string', minLength: 10, maxLength: 5000 },
				},
			},
			CheckoutQuoteInput: {
				type: 'object',
				additionalProperties: false,
				required: ['priceId'],
				properties: {
					priceId: { type: 'string', format: 'uuid' },
					couponCode: { type: ['string', 'null'] },
				},
			},
			OfferInput: {
				type: 'object',
				additionalProperties: false,
				description:
					'Offer discount, lifecycle, package, billing-term, audience, subscription, recurrence, and trial rules.',
				required: [
					'name',
					'slug',
					'description',
					'couponCode',
					'discountType',
					'percentage',
					'fixedAmount',
					'currency',
					'status',
					'startsAt',
					'endsAt',
					'customerEligibility',
					'subscriptionEvent',
					'discountRecurrence',
					'recurrenceCycles',
					'trialHandling',
					'minimumSubtotal',
					'maximumDiscount',
					'maxRedemptions',
					'maxRedemptionsPerCustomer',
					'stackable',
					'priority',
					'packageIds',
					'priceIds',
					'eligibleTerms',
				],
				properties: {
					name: { type: 'string', minLength: 2, maxLength: 160 },
					slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
					description: { type: ['string', 'null'], maxLength: 5000 },
					couponCode: { type: ['string', 'null'] },
					discountType: { type: 'string', enum: ['percentage', 'fixed'] },
					percentage: {
						type: ['number', 'null'],
						exclusiveMinimum: 0,
						maximum: 100,
					},
					fixedAmount: { type: ['number', 'null'], exclusiveMinimum: 0 },
					currency: { type: 'string', enum: ['INR'] },
					status: { type: 'string', enum: ['draft', 'active', 'archived'] },
					startsAt: { type: ['string', 'null'], format: 'date-time' },
					endsAt: { type: ['string', 'null'], format: 'date-time' },
					customerEligibility: {
						type: 'string',
						enum: ['everyone', 'new_customers', 'existing_customers'],
					},
					subscriptionEvent: {
						type: 'string',
						enum: ['new_subscription', 'renewal', 'both'],
					},
					discountRecurrence: {
						type: 'string',
						enum: ['once', 'cycles', 'term'],
					},
					recurrenceCycles: {
						type: ['integer', 'null'],
						minimum: 1,
						maximum: 120,
					},
					trialHandling: {
						type: 'string',
						enum: ['after_trial', 'immediate', 'exclude_trial'],
					},
					minimumSubtotal: { type: ['number', 'null'], exclusiveMinimum: 0 },
					maximumDiscount: { type: ['number', 'null'], exclusiveMinimum: 0 },
					maxRedemptions: { type: ['integer', 'null'], minimum: 1 },
					maxRedemptionsPerCustomer: { type: 'integer', minimum: 1 },
					stackable: { type: 'boolean' },
					priority: { type: 'integer', minimum: 0, maximum: 10000 },
					packageIds: {
						type: 'array',
						maxItems: 100,
						items: { type: 'string', format: 'uuid' },
					},
					priceIds: {
						type: 'array',
						maxItems: 100,
						items: { type: 'string', format: 'uuid' },
					},
					eligibleTerms: {
						type: 'array',
						maxItems: 24,
						items: {
							type: 'object',
							additionalProperties: false,
							required: ['billingInterval', 'intervalCount'],
							properties: {
								billingInterval: { type: 'string', enum: ['month', 'year'] },
								intervalCount: { type: 'integer', minimum: 1, maximum: 12 },
							},
						},
					},
				},
			},
			PackageInput: {
				type: 'object',
				additionalProperties: false,
				required: [
					'categoryId',
					'description',
					'displayOrder',
					'isFeatured',
					'name',
					'slug',
					'status',
					'trialDuration',
					'trialDurationUnit',
					'trialEnabled',
				],
				properties: {
					categoryId: { type: ['string', 'null'], format: 'uuid' },
					description: { type: ['string', 'null'], maxLength: 5000 },
					displayOrder: { type: 'integer', minimum: 0 },
					isFeatured: { type: 'boolean' },
					name: { type: 'string', minLength: 2, maxLength: 160 },
					slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
					status: { type: 'string', enum: ['draft', 'published', 'archived'] },
					trialEnabled: { type: 'boolean' },
					trialDuration: {
						type: ['integer', 'null'],
						minimum: 1,
						maximum: 365,
					},
					trialDurationUnit: {
						type: ['string', 'null'],
						enum: ['day', 'week', 'month', null],
					},
				},
			},
			AdminOptionsResponse: {
				type: 'object',
				required: ['status', 'message', 'code', 'data'],
				properties: {
					status: { type: 'boolean', const: true },
					message: { type: 'string' },
					code: { type: 'integer', const: 100 },
					data: {
						type: 'object',
						required: ['roles', 'permissions'],
						properties: {
							roles: {
								type: 'array',
								items: {
									type: 'object',
									required: ['id', 'code', 'name', 'permissionIds'],
									properties: {
										id: { type: 'string', format: 'uuid' },
										code: { type: 'string' },
										name: { type: 'string' },
										description: { type: ['string', 'null'] },
										permissionIds: {
											type: 'array',
											items: { type: 'string', format: 'uuid' },
										},
									},
								},
							},
							permissions: {
								type: 'array',
								items: {
									type: 'object',
									required: ['id', 'code', 'name'],
									properties: {
										id: { type: 'string', format: 'uuid' },
										code: { type: 'string' },
										name: { type: 'string' },
									},
								},
							},
						},
					},
				},
			},
			OtpRequest: {
				type: 'object',
				additionalProperties: false,
				required: ['mobile'],
				properties: {
					countryCode: {
						type: 'string',
						pattern: '^\\+?\\d{1,4}$',
						example: '+91',
					},
					mobile: {
						type: 'string',
						pattern: '^(?:~~)?\\d{4,20}$',
						example: '9876543210',
						description:
							'Canonical mobile digits. A leading double tilde is accepted only by the explicitly enabled local development bypass.',
					},
				},
			},
			OtpVerification: {
				type: 'object',
				additionalProperties: false,
				required: ['challengeId', 'otp'],
				properties: {
					challengeId: { type: 'string', format: 'uuid' },
					otp: { type: 'string', pattern: '^\\d{6}$', example: '123456' },
				},
			},
			SessionLabel: {
				type: 'object',
				additionalProperties: false,
				required: ['label'],
				properties: {
					label: {
						type: 'string',
						minLength: 1,
						maxLength: 100,
						example: 'Work laptop',
					},
				},
			},
			CreateAdmin: {
				type: 'object',
				additionalProperties: false,
				required: ['countryCode', 'displayName', 'mobile', 'roleIds'],
				properties: {
					countryCode: { type: 'string', example: '+91' },
					displayName: { type: 'string', maxLength: 160 },
					mobile: { type: 'string', pattern: '^\\d{4,20}$' },
					roleIds: {
						type: 'array',
						minItems: 1,
						maxItems: 10,
						items: { type: 'string', format: 'uuid' },
					},
				},
			},
			HealthResponse: {
				type: 'object',
				required: ['status', 'message', 'code', 'data'],
				properties: {
					status: { type: 'boolean', const: true },
					message: { type: 'string' },
					code: { type: 'integer', const: 100 },
					data: {
						type: 'object',
						required: ['service', 'status'],
						properties: {
							service: { type: 'string' },
							status: { type: 'string', const: 'healthy' },
						},
					},
				},
			},
		},
	},
} as const;
