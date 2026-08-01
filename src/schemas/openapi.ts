/** Phase 0 OpenAPI contract; feature phases extend this document with shared Zod schemas. */
export const OPENAPI_DOCUMENT = {
	openapi: '3.1.0',
	info: {
		title: 'Qubit Hosting Panel API',
		version: '0.1.0',
		description: 'Versioned APIs for the standalone Qubit Hosting Panel.'
	},
	servers: [{ url: '/api/v1' }],
	paths: {
		'/auth/otp/request': {
			post: {
				summary: 'Request a WhatsApp login OTP',
				operationId: 'requestWhatsAppOtp',
				requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/OtpRequest' } } } },
				responses: { '202': { description: 'Enumeration-safe OTP request accepted.' }, '400': { description: 'Validation error.' } }
			}
		},
		'/auth/otp/verify': {
			post: {
				summary: 'Verify a WhatsApp OTP and create a session',
				operationId: 'verifyWhatsAppOtp',
				requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/OtpVerification' } } } },
				responses: { '200': { description: 'Authentication successful.' }, '401': { description: 'OTP invalid or expired.' } }
			}
		},
		'/auth/refresh': {
			post: { summary: 'Rotate a refresh token', operationId: 'refreshSession', responses: { '200': { description: 'Session refreshed.' }, '401': { description: 'Refresh token invalid.' } } }
		},
		'/auth/logout': {
			post: { summary: 'Revoke the bearer session', operationId: 'logout', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Session revoked.' }, '401': { description: 'Authentication required.' } } }
		},
		'/auth/context': {
			post: { summary: 'Switch personal or authorized admin context', operationId: 'switchContext', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Context switched.' }, '403': { description: 'Context is not permitted.' } } }
		},
		'/auth/sessions': {
			get: { summary: 'List every session owned by the current user', operationId: 'listSessions', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Owned sessions with safe device and network metadata.' }, '401': { description: 'Authentication required.' } } }
		},
		'/auth/sessions/{sessionId}': {
			get: { summary: 'View one owned session', operationId: 'getSession', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/SessionId' }], responses: { '200': { description: 'Owned session.' }, '404': { description: 'Session not found.' } } },
			patch: { summary: 'Label one owned device session', operationId: 'labelSession', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/SessionId' }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionLabel' } } } }, responses: { '200': { description: 'Device label updated.' }, '404': { description: 'Session not found.' } } },
			delete: { summary: 'Revoke one owned session', operationId: 'revokeSession', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/SessionId' }], responses: { '200': { description: 'Session revoked.' }, '404': { description: 'Active session not found.' } } }
		},
		'/auth/sessions/others': {
			delete: { summary: 'Revoke all other owned sessions', operationId: 'revokeOtherSessions', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Other active sessions revoked.' } } }
		},
		'/admins': {
			get: { summary: 'List visible platform administrators', operationId: 'listAdmins', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Permission-scoped administrator list.' }, '403': { description: 'Admin permission required.' } } },
			post: { summary: 'Create a passwordless administrator', operationId: 'createAdmin', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAdmin' } } } }, responses: { '201': { description: 'Administrator created.' }, '403': { description: 'Role assignment is not permitted.' } } }
		},
		'/admins/{adminId}': {
			get: { summary: 'View an administrator and security history', operationId: 'getAdmin', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/AdminId' }], responses: { '200': { description: 'Administrator detail.' }, '404': { description: 'Administrator hidden or absent.' } } },
			patch: { summary: 'Update administrator profile or status', operationId: 'updateAdmin', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/AdminId' }], responses: { '200': { description: 'Administrator updated.' }, '422': { description: 'Final Super Admin protection.' } } },
			delete: { summary: 'Soft-delete an administrator', operationId: 'deleteAdmin', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/AdminId' }], responses: { '200': { description: 'Administrator deleted and sessions revoked.' }, '422': { description: 'Final Super Admin protection.' } } }
		},
		'/admins/{adminId}/roles': {
			put: { summary: 'Replace administrator roles', operationId: 'replaceAdminRoles', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/AdminId' }], responses: { '200': { description: 'Roles updated.' }, '403': { description: 'Role would escalate privileges.' } } }
		},
		'/admins/{adminId}/overrides': {
			put: { summary: 'Replace explicit permission overrides', operationId: 'replaceAdminOverrides', security: [{ bearerAuth: [] }], parameters: [{ $ref: '#/components/parameters/AdminId' }], responses: { '200': { description: 'Overrides updated.' }, '403': { description: 'Override would escalate privileges.' } } }
		},
		'/admins/options': {
			get: { summary: 'List assignable roles and permissions', operationId: 'getAdminOptions', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Caller-scoped role and permission options.' }, '403': { description: 'Role visibility permission required.' } } }
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
								schema: { $ref: '#/components/schemas/HealthResponse' }
							}
						}
					}
				}
			}
		}
	},
	components: {
		parameters: {
			AdminId: { name: 'adminId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
			SessionId: { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
		},
		securitySchemes: {
			bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
		},
		schemas: {
			OtpRequest: {
				type: 'object', additionalProperties: false, required: ['localMobileNumber'],
				properties: { localMobileNumber: { type: 'string', pattern: '^\\d{4,20}$', example: '9876543210' } }
			},
			OtpVerification: {
				type: 'object', additionalProperties: false, required: ['challengeId', 'otp'],
				properties: { challengeId: { type: 'string', format: 'uuid' }, otp: { type: 'string', pattern: '^\\d{6}$', example: '123456' } }
			},
			SessionLabel: {
				type: 'object', additionalProperties: false, required: ['label'],
				properties: { label: { type: 'string', minLength: 1, maxLength: 100, example: 'Work laptop' } }
			},
			CreateAdmin: {
				type: 'object', additionalProperties: false, required: ['countryCallingCode', 'displayName', 'localMobileNumber', 'roleIds'],
				properties: { countryCallingCode: { type: 'string', example: '+91' }, displayName: { type: 'string', maxLength: 160 }, localMobileNumber: { type: 'string', pattern: '^\\d{4,20}$' }, roleIds: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', format: 'uuid' } } }
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
							status: { type: 'string', const: 'healthy' }
						}
					}
				}
			}
		}
	}
} as const;
