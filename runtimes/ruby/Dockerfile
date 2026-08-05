ARG RUNTIME_VERSION
FROM ruby:${RUNTIME_VERSION}-slim-bookworm

ENV BUNDLE_DEPLOYMENT=true
ENV BUNDLE_WITHOUT=development:test
ENV PORT=3000
WORKDIR /app

RUN apt-get update \
	&& apt-get upgrade -y \
	&& apt-get install -y --no-install-recommends build-essential default-libmysqlclient-dev git libpq-dev pkg-config \
	&& rm -rf /var/lib/apt/lists/* \
	&& groupadd --gid 10001 app \
	&& useradd --uid 10001 --gid app --create-home app \
	&& chown -R app:app /app

USER app
EXPOSE 3000

CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0", "-p", "3000"]
