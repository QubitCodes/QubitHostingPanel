import {
	index,
	layout,
	prefix,
	route,
	type RouteConfig,
} from '@react-router/dev/routes';

export default [
	index('pages/website/home.tsx'),
	route('login', 'pages/auth/login.tsx'),
	route('login/verify/:challengeId', 'pages/auth/verify.tsx'),
	layout('layouts/application.tsx', [
		route('admin/overview', 'pages/admin/overview.tsx'),
		route('admin/administrators', 'pages/admin/admins.tsx'),
		route(
			'admin/administrators/create',
			'pages/admin/administrators-create.tsx',
		),
		route(
			'admin/administrators/create/:section',
			'pages/admin/administrator-create-section.tsx',
		),
		route(
			'admin/administrators/:adminId',
			'pages/admin/administrator-detail.tsx',
		),
		route(
			'admin/administrators/:adminId/:section',
			'pages/admin/administrator-section.tsx',
		),
		route(
			'admin/administrators/:adminId/edit/:section',
			'pages/admin/administrator-edit-section.tsx',
		),
		layout('layouts/settings.tsx', [
			route('settings/profile', 'pages/account/profile.tsx'),
			route('settings/security', 'pages/account/security.tsx'),
			route('settings/sessions', 'pages/account/sessions.tsx'),
			route('settings/sessions/:sessionId', 'pages/account/session-detail.tsx'),
		]),
		route('search/:query', 'pages/search.tsx'),
	]),
	route('api/docs', 'pages/api/docs.tsx'),
	...prefix('api/v1', [
		route('health', 'api/v1/health.ts'),
		route('openapi.json', 'api/v1/openapi.ts'),
		route('auth/otp/request', 'api/v1/auth/otp-request.ts'),
		route('auth/otp/verify', 'api/v1/auth/otp-verify.ts'),
		route('auth/refresh', 'api/v1/auth/refresh.ts'),
		route('auth/logout', 'api/v1/auth/logout.ts'),
		route('auth/context', 'api/v1/auth/context.ts'),
		route('auth/sessions', 'api/v1/auth/sessions.ts'),
		route('auth/sessions/others', 'api/v1/auth/sessions-others.ts'),
		route('auth/sessions/:sessionId', 'api/v1/auth/session.ts'),
		route('admins', 'api/v1/admins/index.ts'),
		route('admins/options', 'api/v1/admins/options.ts'),
		route('admins/:adminId', 'api/v1/admins/detail.ts'),
		route('admins/:adminId/roles', 'api/v1/admins/roles.ts'),
		route('admins/:adminId/overrides', 'api/v1/admins/overrides.ts'),
	]),
	route('api/*', 'pages/api/catchall.ts'),
	route('*', 'pages/website/not-found.tsx'),
] satisfies RouteConfig;
