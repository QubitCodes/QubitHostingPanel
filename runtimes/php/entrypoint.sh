#!/bin/sh
set -eu

if [ "$#" -gt 0 ] && [ "$1" != "nginx" ]; then
	exec "$@"
fi

php-fpm --daemonize
exec "$@"
