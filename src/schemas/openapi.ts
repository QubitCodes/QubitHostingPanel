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
