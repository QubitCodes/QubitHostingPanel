ARG RUNTIME_VERSION
FROM nginx:${RUNTIME_VERSION}-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
