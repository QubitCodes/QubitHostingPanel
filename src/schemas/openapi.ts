/** Phase 0 OpenAPI contract; feature phases extend this document with shared Zod schemas. */
export const OPENAPI_DOCUMENT = {
	openapi: '3.1.0',
	info: {
		title: 'Qubit Hosting Panel API',
		version: '0.1.0',
		description: 'Versioned APIs for the standalone Qubit Hosting Panel.',
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
					'202': { description: 'Enumeration-safe OTP request accepted.' },
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
					'200': { description: 'Active package records, including drafts and archived packages.' },
					'403': { description: 'packages.view permission required.' },
				},
			},
			post: {
				summary: 'Create a commercial package',
				operationId: 'createPackage',
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: { 'application/json': { schema: { $ref: '#/components/schemas/PackageInput' } } },
				},
				responses: {
					'201': { description: 'Package created.' },
					'400': { description: 'Validation or duplicate-slug error.' },
					'403': { description: 'packages.create permission required; packages.publish is additionally required for non-draft creation.' },
				},
			},
		},
		'/packages/{packageSlug}': {
			get: {
				summary: 'View one package and its audit history',
				operationId: 'showPackage',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				responses: { '200': { description: 'Package details.' }, '404': { description: 'Package not found.' } },
			},
			patch: {
				summary: 'Update or publish a package',
				operationId: 'updatePackage',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PackageInput' } } } },
				responses: { '200': { description: 'Package updated.' }, '403': { description: 'Required package permission missing.' }, '404': { description: 'Package not found.' } },
			},
			delete: {
				summary: 'Soft-delete a package',
				operationId: 'deletePackage',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				responses: { '200': { description: 'Package deleted.' }, '404': { description: 'Package not found.' } },
			},
		},
		'/packages/{packageSlug}/prices': {
			post: {
				summary: 'Create new monthly and yearly package price versions',
				operationId: 'setPackagePrices',
				security: [{ bearerAuth: [] }],
				parameters: [{ $ref: '#/components/parameters/PackageSlug' }],
				requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PackagePricesInput' } } } },
				responses: { '200': { description: 'New active prices created and prior active prices retained as history.' }, '403': { description: 'packages.update permission required.' }, '404': { description: 'Package not found.' } },
			},
		},
		'/package-categories': {
			get: {
				summary: 'List active package categories and inline-create capability',
				operationId: 'listPackageCategories',
				security: [{ bearerAuth: [] }],
				responses: { '200': { description: 'Active package categories.' }, '403': { description: 'package_categories.view permission required.' } },
			},
			post: {
				summary: 'Create a package category',
				operationId: 'createPackageCategory',
				security: [{ bearerAuth: [] }],
				responses: { '201': { description: 'Package category created.' }, '403': { description: 'package_categories.create permission required.' } },
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
	},
	components: {
		parameters: {
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
				required: ['currency', 'monthlyAmount', 'yearlyAmount', 'taxBehavior', 'isPublic'],
				properties: {
					currency: { type: 'string', enum: ['INR'] },
					monthlyAmount: { type: 'number', exclusiveMinimum: 0 },
					yearlyAmount: { type: 'number', exclusiveMinimum: 0 },
					taxBehavior: { type: 'string', enum: ['exclusive', 'inclusive'] },
					isPublic: { type: 'boolean' },
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
					trialDuration: { type: ['integer', 'null'], minimum: 1, maximum: 365 },
					trialDurationUnit: { type: ['string', 'null'], enum: ['day', 'week', 'month', null] },
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
						pattern: '^\\d{4,20}$',
						example: '9876543210',
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
