#!/usr/bin/env bash
set -Eeuo pipefail

image="${1:?Pass the locally built PHP runtime image as the first argument.}"
shift

if [ "$#" -eq 0 ]; then
	echo 'Pass at least one Laravel major version to verify.' >&2
	exit 2
fi

prefix="ghost-deploy-laravel-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"
volumes=()
containers=()

cleanup() {
	for container in "${containers[@]}"; do
		docker rm -f "$container" >/dev/null 2>&1 || true
	done
	for volume in "${volumes[@]}"; do
		docker volume rm -f "$volume" >/dev/null 2>&1 || true
	done
}
trap cleanup EXIT

for laravel_major in "$@"; do
	volume="${prefix}-${laravel_major}"
	container="${prefix}-${laravel_major}"
	volumes+=("$volume")
	containers+=("$container")
	docker volume create "$volume" >/dev/null

	echo "Preparing Laravel ${laravel_major} on ${image}"
	docker run --rm \
		--env COMPOSER_ALLOW_SUPERUSER=1 \
		--env LARAVEL_MAJOR="$laravel_major" \
		--volume "$volume:/app" \
		--entrypoint sh \
		"$image" -ec '
			security_flag=""
			case "$LARAVEL_MAJOR" in
				10|11) security_flag="--no-security-blocking" ;;
			esac
			composer create-project \
				--no-dev \
				--no-interaction \
				--no-progress \
				--no-scripts \
				--prefer-dist \
				$security_flag \
				"laravel/laravel:^${LARAVEL_MAJOR}.0" \
				/tmp/laravel
			cp -a /tmp/laravel/. /app/
			cd /app
			cp .env.example .env
			cat > routes/web.php <<PHP
<?php

use Illuminate\\Support\\Facades\\Route;

Route::get("/ghost-deploy-health", static fn (): string => "laravel-${LARAVEL_MAJOR}-ok");
PHP
			php artisan --version | grep -E "^Laravel Framework ${LARAVEL_MAJOR}\\."
			APP_ENV=production \
			APP_KEY=base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY= \
			CACHE_DRIVER=file \
			CACHE_STORE=file \
			LOG_CHANNEL=stderr \
			SESSION_DRIVER=file \
			php artisan config:cache
			chmod -R a+rwX storage bootstrap/cache
		'

	docker run --detach \
		--name "$container" \
		--publish 127.0.0.1::80 \
		--env APP_ENV=production \
		--env APP_KEY=base64:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY= \
		--env CACHE_DRIVER=file \
		--env CACHE_STORE=file \
		--env LOG_CHANNEL=stderr \
		--env SESSION_DRIVER=file \
		--volume "$volume:/app" \
		"$image" >/dev/null

	port="$(docker port "$container" 80/tcp | sed -n 's/^127\.0\.0\.1://p' | head -n 1)"
	if [ -z "$port" ]; then
		echo "Could not resolve the test port for Laravel ${laravel_major}." >&2
		docker logs "$container" >&2 || true
		exit 1
	fi

	response=''
	for _ in $(seq 1 30); do
		if response="$(curl --fail --silent --show-error "http://127.0.0.1:${port}/ghost-deploy-health" 2>/dev/null)"; then
			break
		fi
		sleep 1
	done

	if [ "$response" != "laravel-${laravel_major}-ok" ]; then
		echo "Laravel ${laravel_major} did not pass the HTTP boot check." >&2
		docker exec "$container" sh -ec 'if [ -f storage/logs/laravel.log ]; then tail -n 200 storage/logs/laravel.log; fi' >&2 || true
		docker logs "$container" >&2 || true
		exit 1
	fi

	echo "Laravel ${laravel_major} passed dependency, Artisan, config-cache, PHP-FPM, nginx and HTTP checks."
	docker rm -f "$container" >/dev/null
	docker volume rm -f "$volume" >/dev/null
done
