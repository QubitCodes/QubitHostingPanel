<?php

define('DB_NAME', getenv('WORDPRESS_DB_NAME'));
define('DB_USER', getenv('WORDPRESS_DB_USER'));
define('DB_PASSWORD', getenv('WORDPRESS_DB_PASSWORD'));
define('DB_HOST', getenv('WORDPRESS_DB_HOST'));
define('DB_CHARSET', 'utf8mb4');
define('DB_COLLATE', '');
define('WP_CONTENT_DIR', __DIR__ . '/wp-content');
define('WP_CONTENT_URL', '/wp-content');

$fixtureSalt = hash('sha256', (string) getenv('HOSTNAME'));
define('AUTH_KEY', $fixtureSalt . 'auth');
define('SECURE_AUTH_KEY', $fixtureSalt . 'secure-auth');
define('LOGGED_IN_KEY', $fixtureSalt . 'logged-in');
define('NONCE_KEY', $fixtureSalt . 'nonce');
define('AUTH_SALT', $fixtureSalt . 'auth-salt');
define('SECURE_AUTH_SALT', $fixtureSalt . 'secure-auth-salt');
define('LOGGED_IN_SALT', $fixtureSalt . 'logged-in-salt');
define('NONCE_SALT', $fixtureSalt . 'nonce-salt');

$table_prefix = 'wp_';
define('WP_DEBUG', false);

if (!defined('ABSPATH')) {
	define('ABSPATH', __DIR__ . '/wordpress/');
}

require_once ABSPATH . 'wp-settings.php';
