#!/bin/sh
set -eu

if [ "$#" -gt 0 ] && [ "$1" != "nginx" ]; then
	exec "$@"
fi

web_root="${GHOST_DEPLOY_WEB_ROOT:-/app/public}"
if [ -f /app/wp-settings.php ]; then
	web_root=/app
elif [ -f /app/bin/cake ] && [ -f /app/webroot/index.php ]; then
	web_root=/app/webroot
elif [ -f /app/yii ] && [ -f /app/web/index.php ]; then
	web_root=/app/web
fi
sed -i "s#root /app/public;#root ${web_root};#" /etc/nginx/nginx.conf

php-fpm --daemonize
exec "$@"
