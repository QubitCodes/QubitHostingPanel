ARG RUNTIME_VERSION
FROM php:${RUNTIME_VERSION}-fpm-bookworm

ENV PORT=80
WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends libicu-dev libicu72 libpq-dev libpq5 libzip-dev libzip4 nginx \
	&& docker-php-ext-install -j"$(nproc)" intl opcache pdo_mysql pdo_pgsql zip \
	&& apt-get purge -y --auto-remove libicu-dev libpq-dev libzip-dev \
	&& rm -rf /var/lib/apt/lists/* /var/www/html \
	&& mkdir -p /app/public /run/nginx \
	&& chown -R www-data:www-data /app

COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /usr/local/bin/qubit-php-entrypoint

RUN chmod 0755 /usr/local/bin/qubit-php-entrypoint

EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 CMD php -r '$s=@fsockopen("127.0.0.1",80,$e,$m,2); exit($s?0:1);'

ENTRYPOINT ["qubit-php-entrypoint"]
CMD ["nginx", "-g", "daemon off;"]
