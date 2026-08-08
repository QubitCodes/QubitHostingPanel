ARG COOLIFY_HELPER_IMAGE=docker.io/coollabsio/coolify-helper:1.0.14
FROM ${COOLIFY_HELPER_IMAGE}

USER root

RUN apk add --no-cache python3 py3-chardet \
	&& mv /usr/local/bin/nixpacks /usr/local/bin/nixpacks-original

COPY normalize-source.py /usr/local/lib/ghostdeploy/normalize-source.py
COPY nixpacks /usr/local/bin/nixpacks

RUN chmod 0755 /usr/local/bin/nixpacks /usr/local/lib/ghostdeploy/normalize-source.py
