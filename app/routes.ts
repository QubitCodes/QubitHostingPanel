import { index, prefix, route, type RouteConfig } from '@react-router/dev/routes';

export default [
	index('pages/website/home.tsx'),
	route('api/docs', 'pages/api/docs.tsx'),
	...prefix('api/v1', [
		route('health', 'api/v1/health.ts'),
		route('openapi.json', 'api/v1/openapi.ts'),
		route('auth/otp/request', 'api/v1/auth/otp-request.ts'),
		route('auth/otp/verify', 'api/v1/auth/otp-verify.ts'),
		route('auth/refresh', 'api/v1/auth/refresh.ts'),
		route('auth/logout', 'api/v1/auth/logout.ts'),
		route('auth/context', 'api/v1/auth/context.ts')
	]),
	route('api/*', 'pages/api/catchall.ts'),
	route('*', 'pages/website/not-found.tsx')
] satisfies RouteConfig;
