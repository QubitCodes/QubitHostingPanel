import { index, prefix, route, type RouteConfig } from '@react-router/dev/routes';

export default [
	index('pages/website/home.tsx'),
	route('api/docs', 'pages/api/docs.tsx'),
	...prefix('api/v1', [
		route('health', 'api/v1/health.ts'),
		route('openapi.json', 'api/v1/openapi.ts')
	]),
	route('api/*', 'pages/api/catchall.ts'),
	route('*', 'pages/website/not-found.tsx')
] satisfies RouteConfig;
